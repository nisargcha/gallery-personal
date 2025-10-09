import os
import datetime
import logging
from functools import wraps
from flask import Flask, request, jsonify, g, abort
from flask_cors import CORS
from google.cloud import storage
import firebase_admin
from firebase_admin import auth, credentials
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Firebase Admin
if not firebase_admin._apps:
    firebase_admin.initialize_app()
    logger.info("Firebase Admin SDK initialized")

app = Flask(__name__)

# ============================================================================
# CORS Configuration - FIXED
# ============================================================================
ALLOWED_ORIGINS = [
    'https://gallery-personal.vercel.app',  # Replace with your actual Vercel URL
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:3000'
]

CORS(app, 
     resources={
         r"/*": {
             "origins": ALLOWED_ORIGINS,
             "methods": ["GET", "POST", "DELETE", "OPTIONS"],
             "allow_headers": ["Content-Type", "Authorization"],
             "expose_headers": ["Content-Type"],
             "supports_credentials": True,
             "max_age": 3600
         }
     })

# ============================================================================
# Environment Variables
# ============================================================================
BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME')
SIGNING_SERVICE_ACCOUNT = os.environ.get('SIGNING_SERVICE_ACCOUNT_EMAIL')

if not BUCKET_NAME:
    logger.error("GCS_BUCKET_NAME environment variable not set")
    raise ValueError("GCS_BUCKET_NAME must be set")

# Initialize GCS Client
try:
    storage_client = storage.Client()
    bucket = storage_client.bucket(BUCKET_NAME)
    logger.info(f"Connected to GCS bucket: {BUCKET_NAME}")
except Exception as e:
    logger.error(f"Failed to initialize GCS client: {str(e)}")
    raise

# ============================================================================
# Authentication Decorator - IMPROVED
# ============================================================================
def auth_required(f):
    """
    A decorator to protect endpoints. It verifies the Firebase ID token
    from the Authorization header and attaches the user's info to the request.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Allow OPTIONS requests to pass through for CORS preflight
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)

        auth_header = request.headers.get('Authorization')
        
        if not auth_header or not auth_header.startswith('Bearer '):
            logger.warning("Missing or invalid Authorization header")
            return jsonify({
                'error': 'Unauthorized',
                'message': 'Missing or invalid Authorization header'
            }), 401
        
        id_token = auth_header.split('Bearer ')[1]
        
        try:
            decoded_token = auth.verify_id_token(id_token)
            g.user = decoded_token
            logger.info(f"User authenticated: {decoded_token.get('email')} (uid: {decoded_token['uid']})")
        except auth.ExpiredIdTokenError:
            logger.warning("Expired token attempt")
            return jsonify({
                'error': 'Token expired',
                'message': 'Your session has expired. Please sign in again.'
            }), 403
        except auth.InvalidIdTokenError as e:
            logger.warning(f"Invalid token: {str(e)}")
            return jsonify({
                'error': 'Invalid token',
                'message': 'Authentication token is invalid'
            }), 403
        except Exception as e:
            logger.error(f"Token verification error: {str(e)}")
            return jsonify({
                'error': 'Authentication failed',
                'message': str(e)
            }), 403
            
        return f(*args, **kwargs)
    return decorated_function

# ============================================================================
# Health Check Endpoint - NEW
# ============================================================================
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring"""
    return jsonify({
        'status': 'healthy',
        'service': 'photo-gallery-backend',
        'timestamp': datetime.datetime.utcnow().isoformat()
    }), 200

# ============================================================================
# Get Folders Endpoint - IMPROVED
# ============================================================================
@app.route('/get-folders', methods=['GET', 'OPTIONS'])
@auth_required
def get_folders():
    """Lists all albums for the authenticated user."""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = g.user['uid']
        user_email = g.user.get('email', 'unknown')
        user_prefix = f"{user_id}/"
        
        logger.info(f"Fetching folders for user: {user_email}")
        
        blobs = storage_client.list_blobs(BUCKET_NAME, prefix=user_prefix, delimiter='/')
        list(blobs)  # Consume iterator to populate prefixes
        
        folders = [
            prefix.replace(user_prefix, '', 1).rstrip('/')
            for prefix in blobs.prefixes
        ]
        
        logger.info(f"Found {len(folders)} folders for user {user_email}")
        return jsonify({'folders': sorted(folders)}), 200
        
    except Exception as e:
        logger.error(f"Error fetching folders: {str(e)}")
        return jsonify({
            'error': 'Failed to fetch folders',
            'message': str(e)
        }), 500
# ============================================================================
# Get Photos Endpoint - IMPROVED
# ============================================================================
@app.route('/get-photos', methods=['GET', 'OPTIONS'])
@auth_required
def get_photos():
    """Lists all photos within a specific album for the authenticated user."""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = g.user['uid']
        user_email = g.user.get('email', 'unknown')
        folder_name = request.args.get('folder')
        
        if not folder_name:
            return jsonify({
                'error': 'Bad request',
                'message': 'Folder name query parameter is required'
            }), 400

        full_prefix = f"{user_id}/{folder_name}/" # Ensure trailing slash
        logger.info(f"Fetching photos from {full_prefix} for user {user_email}")
        
        photos_data = []
        blobs = bucket.list_blobs(prefix=full_prefix)

        for blob in blobs:
            # Skip folder markers
            if blob.name.endswith('/') or blob.name.endswith('.gkeep'):
                continue
            
            # Only include images and videos
            if blob.content_type and (
                blob.content_type.startswith('image/') or 
                blob.content_type.startswith('video/')
            ):
                try:
                    # This is the corrected way to generate a signed URL in Cloud Run
                    url = blob.generate_signed_url(
                        version="v4",
                        expiration=datetime.timedelta(hours=1),
                        method="GET"
                    )
                    
                    photos_data.append({
                        'filename': blob.name,
                        'name': os.path.basename(blob.name),
                        'url': url,
                        'type': blob.content_type,
                        'size': blob.size,
                        'updated': blob.updated.isoformat() if blob.updated else None
                    })
                except Exception as e:
                    logger.error(f"Failed to generate signed URL for {blob.name}: {str(e)}")
                    continue
        
        logger.info(f"Found {len(photos_data)} photos in folder {folder_name}")
        return jsonify({'photos': photos_data}), 200
        
    except Exception as e:
        logger.error(f"Error fetching photos: {str(e)}")
        return jsonify({
            'error': 'Failed to fetch photos',
            'message': str(e)
        }), 500

# ============================================================================
# Create Folder Endpoint - IMPROVED
# ============================================================================
@app.route('/create-folder', methods=['POST', 'OPTIONS'])
@auth_required
def create_folder():
    """Creates a new album (folder) for the authenticated user."""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = g.user['uid']
        user_email = g.user.get('email', 'unknown')
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'Bad request',
                'message': 'Request body is required'
            }), 400
        
        folder_name = data.get('folder', '').strip()
        
        if not folder_name:
            return jsonify({
                'error': 'Bad request',
                'message': 'Folder name is required'
            }), 400
        
        # Ensure folder name ends with /
        if not folder_name.endswith('/'):
            folder_name += '/'
        
        # Validate folder name (no special characters except -, _)
        if not all(c.isalnum() or c in ['-', '_', '/'] for c in folder_name):
            return jsonify({
                'error': 'Bad request',
                'message': 'Folder name contains invalid characters'
            }), 400
        
        full_path = f"{user_id}/{folder_name}.gkeep"
        blob = bucket.blob(full_path)
        
        # Check if folder already exists
        if blob.exists():
            return jsonify({
                'error': 'Conflict',
                'message': f'Folder {folder_name.rstrip("/")} already exists'
            }), 409
        
        blob.upload_from_string('', content_type='application/octet-stream')
        logger.info(f"Folder created: {full_path} by user {user_email}")
        
        return jsonify({
            'message': f'Folder {folder_name.rstrip("/")} created successfully',
            'folder': folder_name.rstrip('/')
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating folder: {str(e)}")
        return jsonify({
            'error': 'Failed to create folder',
            'message': str(e)
        }), 500
# ============================================================================
# Generate Upload URL Endpoint - IMPROVED
# ============================================================================
@app.route('/generate-upload-url', methods=['POST', 'OPTIONS'])
@auth_required
def generate_upload_url():
    """Generates a secure, temporary URL to upload a photo to a specific album."""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = g.user['uid']
        user_email = g.user.get('email', 'unknown')
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'Bad request',
                'message': 'Request body is required'
            }), 400
        
        if not all(k in data for k in ['filename', 'folder']):
            return jsonify({
                'error': 'Bad request',
                'message': 'Filename and folder are required'
            }), 400

        filename = data['filename']
        folder = data['folder'].rstrip('/')
        content_type = data.get('contentType', 'application/octet-stream')
        
        full_path = f"{user_id}/{folder}/{filename}"
        blob = bucket.blob(full_path)

        url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=15),
            method="PUT",
            content_type=content_type
        )
        
        logger.info(f"Upload URL generated for {full_path} by user {user_email}")
        
        return jsonify({
            'url': url,
            'path': full_path,
            'expiresIn': 900  # 15 minutes in seconds
        }), 200
        
    except Exception as e:
        logger.error(f"Error generating upload URL: {str(e)}")
        return jsonify({
            'error': 'Failed to generate upload URL',
            'message': str(e)
        }), 500
    
# ============================================================================
# Delete Photo Endpoint - IMPROVED
# ============================================================================
@app.route('/delete-photo', methods=['DELETE', 'OPTIONS'])
@auth_required
def delete_photo():
    """Deletes a photo, ensuring it belongs to the authenticated user."""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = g.user['uid']
        user_email = g.user.get('email', 'unknown')
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'Bad request',
                'message': 'Request body is required'
            }), 400
        
        filename = data.get('filename')  # e.g., "uid/album/photo.jpg"
        
        if not filename:
            return jsonify({
                'error': 'Bad request',
                'message': 'Filename is required'
            }), 400
        
        # Security check: Ensure the file being deleted belongs to the user
        if not filename.startswith(user_id + '/'):
            logger.warning(f"User {user_email} attempted to delete file not owned: {filename}")
            return jsonify({
                'error': 'Forbidden',
                'message': 'You can only delete your own photos'
            }), 403
        
        blob = bucket.blob(filename)
        
        if not blob.exists():
            return jsonify({
                'error': 'Not found',
                'message': 'File not found'
            }), 404
        
        blob.delete()
        logger.info(f"File deleted: {filename} by user {user_email}")
        
        return jsonify({
            'message': f'File deleted successfully',
            'filename': filename
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting photo: {str(e)}")
        return jsonify({
            'error': 'Failed to delete photo',
            'message': str(e)
        }), 500

# ============================================================================
# Delete Folder Endpoint - NEW (BONUS)
# ============================================================================
@app.route('/delete-folder', methods=['DELETE', 'OPTIONS'])
@auth_required
def delete_folder():
    """Deletes an entire folder and all its contents."""
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        user_id = g.user['uid']
        user_email = g.user.get('email', 'unknown')
        data = request.get_json()
        
        if not data:
            return jsonify({
                'error': 'Bad request',
                'message': 'Request body is required'
            }), 400
        
        folder_name = data.get('folder', '').strip()
        
        if not folder_name:
            return jsonify({
                'error': 'Bad request',
                'message': 'Folder name is required'
            }), 400
        
        # Ensure proper prefix format
        folder_prefix = f"{user_id}/{folder_name.rstrip('/')}/"
        
        # List all blobs in the folder
        blobs = list(bucket.list_blobs(prefix=folder_prefix))
        
        if not blobs:
            return jsonify({
                'error': 'Not found',
                'message': 'Folder not found or already empty'
            }), 404
        
        # Delete all blobs
        deleted_count = 0
        for blob in blobs:
            blob.delete()
            deleted_count += 1
        
        logger.info(f"Folder deleted: {folder_prefix} ({deleted_count} files) by user {user_email}")
        
        return jsonify({
            'message': f'Folder deleted successfully',
            'folder': folder_name,
            'filesDeleted': deleted_count
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting folder: {str(e)}")
        return jsonify({
            'error': 'Failed to delete folder',
            'message': str(e)
        }), 500

# ============================================================================
# Error Handlers - NEW
# ============================================================================
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'error': 'Not found',
        'message': 'The requested resource was not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({
        'error': 'Internal server error',
        'message': 'An unexpected error occurred'
    }), 500

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({
        'error': 'Method not allowed',
        'message': 'The HTTP method is not allowed for this endpoint'
    }), 405

# ============================================================================
# Main
# ============================================================================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
