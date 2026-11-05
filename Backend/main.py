import os
import re
import datetime
import logging
from functools import wraps

from flask import Flask, request, jsonify, g
from flask_cors import CORS
from flask_limiter import Limiter
from google.cloud import storage
import google.auth
from google.auth.transport.requests import Request
import firebase_admin
from firebase_admin import auth
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------------
# Firebase Admin
# ----------------------------------------------------------------------------
if not firebase_admin._apps:
    firebase_admin.initialize_app()
    logger.info("Firebase Admin SDK initialized")

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 1 * 1024 * 1024  # API bodies are tiny

# ----------------------------------------------------------------------------
# Config
# ----------------------------------------------------------------------------
BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME')
SIGNING_SERVICE_ACCOUNT = os.environ.get('SIGNING_SERVICE_ACCOUNT_EMAIL')
ALLOWED_EMAILS = {
    e.strip().lower()
    for e in os.environ.get('ALLOWED_EMAILS', '').split(',')
    if e.strip()
}
DEV_MODE = os.environ.get('DEV') == '1'

if not BUCKET_NAME:
    raise ValueError("GCS_BUCKET_NAME must be set")
if not ALLOWED_EMAILS:
    logger.warning("ALLOWED_EMAILS is empty - all users will be rejected")

NAME_RE = re.compile(r'^[A-Za-z0-9_-]{1,50}$')
FILE_RE = re.compile(r'^[A-Za-z0-9._-]{1,100}$')
ALLOWED_TYPES = {
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'
}
MAX_BYTES = 25 * 1024 * 1024  # 25 MB per upload

# ----------------------------------------------------------------------------
# CORS
# ----------------------------------------------------------------------------
ALLOWED_ORIGINS = ['https://gallery-personal.vercel.app']
if DEV_MODE:
    ALLOWED_ORIGINS += [
        'http://localhost:5000', 'http://localhost:3000',
        'http://127.0.0.1:5000', 'http://127.0.0.1:3000'
    ]

CORS(app, resources={r"/*": {
    "origins": ALLOWED_ORIGINS,
    "methods": ["GET", "POST", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"],
    "supports_credentials": False,
    "max_age": 3600
}})

# ----------------------------------------------------------------------------
# Rate limiting (behind Cloud Run, real IP is first in X-Forwarded-For)
# ----------------------------------------------------------------------------
def client_ip():
    fwd = request.headers.get('X-Forwarded-For', '')
    return fwd.split(',')[0].strip() if fwd else (request.remote_addr or 'unknown')

limiter = Limiter(client_ip, app=app, default_limits=["60 per minute"],
                  storage_uri="memory://")

# ----------------------------------------------------------------------------
# GCS client - uses the Cloud Run service account (no key file)
# ----------------------------------------------------------------------------
creds, _project = google.auth.default()
storage_client = storage.Client(credentials=creds)
bucket = storage_client.bucket(BUCKET_NAME)
logger.info("Connected to GCS bucket: %s", BUCKET_NAME)


def signed_url(blob, **kwargs):
    """Generate a V4 signed URL via IAM signing (no private key needed)."""
    if not creds.valid:
        creds.refresh(Request())
    sa_email = SIGNING_SERVICE_ACCOUNT or getattr(creds, 'service_account_email', None)
    return blob.generate_signed_url(
        version="v4",
        service_account_email=sa_email,
        access_token=creds.token,
        **kwargs
    )

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
def err(status, error, message):
    return jsonify({'error': error, 'message': message}), status


def server_error(action, exc):
    logger.error("Error during %s: %s", action, exc)
    return err(500, 'Server error', 'Something went wrong')


def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)

        header = request.headers.get('Authorization', '')
        if not header.startswith('Bearer '):
            return err(401, 'Unauthorized', 'Missing or invalid Authorization header')

        token = header[len('Bearer '):].strip()
        try:
            decoded = auth.verify_id_token(token, check_revoked=True)
        except auth.ExpiredIdTokenError:
            return err(401, 'Token expired', 'Please sign in again')
        except (auth.InvalidIdTokenError, auth.RevokedIdTokenError,
                auth.UserDisabledError, ValueError):
            return err(401, 'Invalid token', 'Authentication token is invalid')
        except Exception as e:
            logger.error("Token verification error: %s", e)
            return err(401, 'Authentication failed', 'Authentication failed')

        email = (decoded.get('email') or '').lower()
        if not decoded.get('email_verified') or email not in ALLOWED_EMAILS:
            logger.warning("Rejected non-allowlisted uid: %s", decoded.get('uid'))
            return err(403, 'Forbidden', 'Access denied')

        g.user = decoded
        return f(*args, **kwargs)
    return decorated

# ----------------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------------
@app.route('/health', methods=['GET'])
@limiter.exempt
def health_check():
    return jsonify({'status': 'healthy'}), 200


@app.route('/get-folders', methods=['GET', 'OPTIONS'])
@auth_required
def get_folders():
    if request.method == 'OPTIONS':
        return '', 204
    try:
        user_prefix = f"{g.user['uid']}/"
        blobs = storage_client.list_blobs(BUCKET_NAME, prefix=user_prefix, delimiter='/')
        list(blobs)  # consume iterator to populate prefixes
        folders = [p.replace(user_prefix, '', 1).rstrip('/') for p in blobs.prefixes]
        return jsonify({'folders': sorted(folders)}), 200
    except Exception as e:
        return server_error('get-folders', e)


@app.route('/get-photos', methods=['GET', 'OPTIONS'])
@auth_required
def get_photos():
    if request.method == 'OPTIONS':
        return '', 204
    try:
        folder = request.args.get('folder', '').strip().rstrip('/')
        if not NAME_RE.fullmatch(folder):
            return err(400, 'Bad request', 'Invalid folder name')

        prefix = f"{g.user['uid']}/{folder}/"
        photos = []
        for blob in bucket.list_blobs(prefix=prefix):
            if blob.name.endswith('/') or blob.name.endswith('.gkeep'):
                continue
            ctype = blob.content_type or ''
            if not (ctype.startswith('image/') or ctype.startswith('video/')):
                continue
            try:
                url = signed_url(blob, expiration=datetime.timedelta(minutes=15),
                                 method="GET")
            except Exception as e:
                logger.error("Signed URL failed for %s: %s", blob.name, e)
                continue
            photos.append({
                'filename': blob.name,
                'name': os.path.basename(blob.name),
                'url': url,
                'type': ctype,
                'size': blob.size,
                'updated': blob.updated.isoformat() if blob.updated else None
            })
        return jsonify({'photos': photos}), 200
    except Exception as e:
        return server_error('get-photos', e)


@app.route('/create-folder', methods=['POST', 'OPTIONS'])
@auth_required
def create_folder():
    if request.method == 'OPTIONS':
        return '', 204
    try:
        data = request.get_json(silent=True) or {}
        folder = str(data.get('folder', '')).strip().rstrip('/')
        if not NAME_RE.fullmatch(folder):
            return err(400, 'Bad request',
                       'Folder name must be 1-50 chars: letters, numbers, - or _')

        blob = bucket.blob(f"{g.user['uid']}/{folder}/.gkeep")
        if blob.exists():
            return err(409, 'Conflict', f'Folder {folder} already exists')

        blob.upload_from_string('', content_type='application/octet-stream')
        logger.info("Folder created: %s (uid %s)", folder, g.user['uid'])
        return jsonify({'message': f'Folder {folder} created successfully',
                        'folder': folder}), 201
    except Exception as e:
        return server_error('create-folder', e)


@app.route('/generate-upload-url', methods=['POST', 'OPTIONS'])
@auth_required
@limiter.limit("30 per minute")
def generate_upload_url():
    if request.method == 'OPTIONS':
        return '', 204
    try:
        data = request.get_json(silent=True) or {}
        folder = str(data.get('folder', '')).strip().rstrip('/')
        filename = str(data.get('filename', '')).strip()
        content_type = str(data.get('contentType', '')).strip().lower()

        if not NAME_RE.fullmatch(folder):
            return err(400, 'Bad request', 'Invalid folder name')
        if not FILE_RE.fullmatch(filename) or '..' in filename:
            return err(400, 'Bad request', 'Invalid filename')
        if content_type not in ALLOWED_TYPES:
            return err(400, 'Bad request', 'File type not allowed')

        full_path = f"{g.user['uid']}/{folder}/{filename}"
        blob = bucket.blob(full_path)

        url = signed_url(
            blob,
            expiration=datetime.timedelta(minutes=15),
            method="PUT",
            content_type=content_type,
            headers={"x-goog-content-length-range": f"0,{MAX_BYTES}"}
        )
        return jsonify({'url': url, 'path': full_path, 'expiresIn': 900,
                        'maxBytes': MAX_BYTES}), 200
    except Exception as e:
        return server_error('generate-upload-url', e)


@app.route('/delete-photo', methods=['DELETE', 'OPTIONS'])
@auth_required
def delete_photo():
    if request.method == 'OPTIONS':
        return '', 204
    try:
        data = request.get_json(silent=True) or {}
        filename = str(data.get('filename', '')).strip()
        if not filename:
            return err(400, 'Bad request', 'Filename is required')

        uid = g.user['uid']
        parts = filename.split('/')
        # Must be exactly: uid / folder / file, with no traversal tricks
        if (len(parts) != 3 or parts[0] != uid or '..' in parts
                or not NAME_RE.fullmatch(parts[1]) or not FILE_RE.fullmatch(parts[2])):
            logger.warning("Blocked delete attempt by uid %s: %s", uid, filename)
            return err(403, 'Forbidden', 'You can only delete your own photos')

        blob = bucket.blob(filename)
        if not blob.exists():
            return err(404, 'Not found', 'File not found')

        blob.delete()
        logger.info("File deleted: %s", filename)
        return jsonify({'message': 'File deleted successfully',
                        'filename': filename}), 200
    except Exception as e:
        return server_error('delete-photo', e)


@app.route('/delete-folder', methods=['DELETE', 'OPTIONS'])
@auth_required
def delete_folder():
    if request.method == 'OPTIONS':
        return '', 204
    try:
        data = request.get_json(silent=True) or {}
        folder = str(data.get('folder', '')).strip().rstrip('/')
        if not NAME_RE.fullmatch(folder):
            return err(400, 'Bad request', 'Invalid folder name')

        prefix = f"{g.user['uid']}/{folder}/"
        blobs = list(bucket.list_blobs(prefix=prefix))
        if not blobs:
            return err(404, 'Not found', 'Folder not found or already empty')

        for blob in blobs:
            blob.delete()
        logger.info("Folder deleted: %s (%d files)", prefix, len(blobs))
        return jsonify({'message': 'Folder deleted successfully',
                        'folder': folder, 'filesDeleted': len(blobs)}), 200
    except Exception as e:
        return server_error('delete-folder', e)

# ----------------------------------------------------------------------------
# Error handlers
# ----------------------------------------------------------------------------
@app.errorhandler(404)
def not_found(_):
    return err(404, 'Not found', 'The requested resource was not found')


@app.errorhandler(405)
def method_not_allowed(_):
    return err(405, 'Method not allowed', 'The HTTP method is not allowed')


@app.errorhandler(413)
def too_large(_):
    return err(413, 'Too large', 'Request body too large')


@app.errorhandler(429)
def rate_limited(_):
    return err(429, 'Too many requests', 'Slow down and try again shortly')


@app.errorhandler(500)
def internal_error(e):
    logger.error("Internal server error: %s", e)
    return err(500, 'Server error', 'An unexpected error occurred')


@app.after_request
def security_headers(resp):
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['Cache-Control'] = 'no-store'
    return resp


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)