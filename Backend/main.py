import os
import datetime
from functools import wraps
from flask import Flask, request, jsonify, g, abort
from flask_cors import CORS
from google.cloud import storage
import firebase_admin
from firebase_admin import auth, credentials
from dotenv import load_dotenv

load_dotenv()

if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
    cred = credentials.Certificate(os.getenv('GOOGLE_APPLICATION_CREDENTIALS'))
    firebase_admin.initialize_app(cred)
else:
    firebase_admin.initialize_app()

app = Flask(__name__)
CORS(app)

BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME')
storage_client = storage.Client()
bucket = storage_client.bucket(BUCKET_NAME)


def auth_required(f):
    """
    A decorator to protect endpoints. It verifies the Firebase ID token
    from the Authorization header and attaches the user's info to the request.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            abort(401, description='Missing or invalid Authorization header.')
        
        id_token = auth_header.split('Bearer ')[1]
        try:
            decoded_token = auth.verify_id_token(id_token)
            g.user = decoded_token
        except Exception as e:
            abort(403, description=f'Invalid or expired token: {e}')
            
        return f(*args, **kwargs)
    return decorated_function



@app.route('/get-folders', methods=['GET'])
@auth_required
def get_folders():
    """Lists all albums for the authenticated user."""
    user_id = g.user['uid']
    user_prefix = f"{user_id}/"
    
    blobs = storage_client.list_blobs(BUCKET_NAME, prefix=user_prefix, delimiter='/')
    list(blobs)  
    folders = [prefix.replace(user_prefix, '', 1).rstrip('/') for prefix in blobs.prefixes]
    return jsonify(sorted(folders))


@app.route('/get-photos', methods=['GET'])
@auth_required
def get_photos():
    """Lists all photos within a specific album for the authenticated user."""
    user_id = g.user['uid']
    folder_name = request.args.get('folder')
    if not folder_name:
        return jsonify({"error": "Folder name query parameter is required"}), 400

    full_prefix = f"{user_id}/{folder_name}"
    photos_data = []
    blobs = bucket.list_blobs(prefix=full_prefix)

    for blob in blobs:
  
        if not blob.name.endswith('.gkeep') and blob.content_type and blob.content_type.startswith('image/'):
            url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.timedelta(hours=1),
                method="GET",
            )
            photos_data.append({'filename': blob.name, 'url': url})
        
    return jsonify(photos_data)


@app.route('/create-folder', methods=['POST'])
@auth_required
def create_folder():
    """Creates a new album (folder) for the authenticated user."""
    user_id = g.user['uid']
    data = request.get_json()
    folder_name = data.get('folder') 
    if not folder_name or not folder_name.endswith('/'):
        return jsonify({'error': 'Folder name must be provided and end with /'}), 400
        
    full_path = f"{user_id}/{folder_name}.gkeep"
    blob = bucket.blob(full_path)
    blob.upload_from_string('', content_type='application/octet-stream')
    return jsonify({'message': f'Folder {folder_name} created.'}), 201


@app.route('/generate-upload-url', methods=['POST'])
@auth_required
def generate_upload_url():
    """Generates a secure, temporary URL to upload a photo to a specific album."""
    user_id = g.user['uid']
    data = request.get_json()
    if not all(k in data for k in ['filename', 'folder']):
        return jsonify({'error': 'Filename and folder are required'}), 400

    full_path = f"{user_id}/{data['folder']}{data['filename']}"
    blob = bucket.blob(full_path)

    url = blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=15),
        method="PUT",
        content_type=data.get('contentType', 'application/octet-stream')
    )
    return jsonify({'url': url})


@app.route('/delete-photo', methods=['DELETE'])
@auth_required
def delete_photo():
    """Deletes a photo, ensuring it belongs to the authenticated user."""
    user_id = g.user['uid']
    data = request.get_json()
    filename = data.get('filename') # e.g., "uid/album/photo.jpg"
    if not filename:
        return jsonify({'error': 'Filename is required'}), 400
    
    # Security check: Ensure the file being deleted belongs to the user
    if not filename.startswith(user_id + '/'):
        abort(403, description="Forbidden: You can only delete your own photos.")
    
    blob = bucket.blob(filename)
    if not blob.exists():
        return jsonify({'message': 'File not found.'}), 404
        
    blob.delete()
    return jsonify({'message': f'File {filename} deleted successfully.'}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)), debug=True)