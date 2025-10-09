// Import authentication functions
import { signIn, signUp, signOutUser, onAuthStateChange, getIdToken, signInWithGoogle } from './auth.js';

// ============================================================================
// UI Functions (No separate ui.js file needed)
// ============================================================================

function showAuthView() {
    document.getElementById('auth-view').style.display = 'block';
    document.getElementById('app-view').style.display = 'none';
}

function showAppView() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('app-view').style.display = 'flex';
}

function showMessage(message, type) {
    const messageDiv = document.getElementById('message');
    if (!messageDiv) return;

    if (!message || type === 'clear') {
        messageDiv.style.display = 'none';
        return;
    }

    messageDiv.textContent = message;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';

    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            if (messageDiv.textContent === message) {
                messageDiv.style.display = 'none';
            }
        }, 3000);
    }
}

function toggleAuthForm(isLogin) {
    const title = document.getElementById('auth-title');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleBtn = document.getElementById('auth-toggle');

    if (isLogin) {
        title.textContent = 'Sign In';
        submitBtn.textContent = 'Sign In';
        toggleBtn.textContent = 'Need an account? Sign Up';
    } else {
        title.textContent = 'Sign Up';
        submitBtn.textContent = 'Sign Up';
        toggleBtn.textContent = 'Have an account? Sign In';
    }
}


// ============================================================================
// Main Application Logic
// ============================================================================

// Configuration
const API_BASE_URL = 'https://photo-gallery-service-913570853508.us-east1.run.app';

// DOM Elements & State
let authForm, signOutBtn, googleSignInBtn, authToggleBtn, createFolderBtn, newFolderNameInput, fileInput, uploadFileBtn;
let currentFolder = null;
let isLoginView = true;
let currentPhotos = [];
let currentPhotoIndex = 0;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    setupEventListeners();
    setupAuthObserver();
});

function initializeElements() {
    authForm = document.getElementById('auth-form');
    signOutBtn = document.getElementById('signout-btn');
    googleSignInBtn = document.getElementById('google-signin-btn');
    authToggleBtn = document.getElementById('auth-toggle');
    createFolderBtn = document.getElementById('create-folder-btn');
    newFolderNameInput = document.getElementById('newFolderName');
    fileInput = document.getElementById('fileInput');
    uploadFileBtn = document.getElementById('upload-file-btn');
}

function setupEventListeners() {
    if (authForm) {
        authForm.addEventListener('submit', handleAuthFormSubmit);
    }
    if (signOutBtn) {
        signOutBtn.addEventListener('click', handleSignOut);
    }
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', handleGoogleSignIn);
    }
    if (authToggleBtn) {
        authToggleBtn.addEventListener('click', () => {
            isLoginView = !isLoginView;
            toggleAuthForm(isLoginView);
        });
    }
    if (createFolderBtn) {
        createFolderBtn.addEventListener('click', handleCreateFolder);
    }
    if (uploadFileBtn) {
        uploadFileBtn.addEventListener('click', () => fileInput.click());
    }
     if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    // Modal listeners
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-prev').addEventListener('click', showPrevPhoto);
    document.getElementById('modal-next').addEventListener('click', showNextPhoto);
    document.getElementById('modal-download').addEventListener('click', downloadCurrentImage);
    
    // Setup drag and drop
    setupDragAndDrop();
}

function setupAuthObserver() {
    onAuthStateChange((state) => {
        if (state.signedIn) {
            showAppView();
            loadGallery();
        } else {
            showAuthView();
        }
    });
}

// ============================================================================
// Authentication Handlers
// ============================================================================

async function handleAuthFormSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    
    if (isLoginView) {
        await handleLogin(email, password);
    } else {
        await handleSignup(email, password);
    }
}

async function handleLogin(email, password) {
    showMessage('Signing in...', 'info');
    const result = await signIn(email, password);
    if (!result.success) {
        showMessage(`Login failed: ${result.error}`, 'error');
    }
}

async function handleSignup(email, password) {
    if (password.length < 6) {
        showMessage('Password must be at least 6 characters', 'error');
        return;
    }
    showMessage('Creating account...', 'info');
    const result = await signUp(email, password);
    if (!result.success) {
        showMessage(`Signup failed: ${result.error}`, 'error');
    }
}

async function handleSignOut() {
    const result = await signOutUser();
    if (result.success) {
        showMessage('Signed out successfully', 'success');
    }
}

async function handleGoogleSignIn() {
    showMessage('Signing in with Google...', 'info');
    const result = await signInWithGoogle();
    if (!result.success) {
        showMessage(`Google sign-in failed: ${result.error}`, 'error');
    }
}

// ============================================================================
// API Functions
// ============================================================================

async function apiFetch(endpoint, options = {}) {
    const token = await getIdToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API error: ${response.status}`);
    }
    return response.json();
}

const fetchFolders = () => apiFetch('/get-folders');
const fetchPhotos = (folderName) => apiFetch(`/get-photos?folder=${encodeURIComponent(folderName)}`);
const createFolder = (folderName) => apiFetch('/create-folder', { method: 'POST', body: JSON.stringify({ folder: folderName }) });
const generateUploadUrl = (filename, folder, contentType) => apiFetch('/generate-upload-url', { method: 'POST', body: JSON.stringify({ filename, folder, contentType }) });
const deletePhoto = (filename) => apiFetch('/delete-photo', { method: 'DELETE', body: JSON.stringify({ filename }) });

async function uploadFileToSignedUrl(signedUrl, file, contentType) {
    const response = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
}

// ============================================================================
// Gallery & Photo Logic
// ============================================================================

async function loadGallery() {
    try {
        showMessage('Loading albums...', 'info');
        const { folders } = await fetchFolders();
        displayFolders(folders);
        showMessage('', 'clear');
    } catch (error) {
        handleAuthError(error);
    }
}

async function loadPhotos(folderName) {
    try {
        currentFolder = folderName;
        document.getElementById('albumTitle').textContent = folderName;
        document.getElementById('uploadAlbumName').textContent = folderName;
        document.getElementById('uploadSection').style.display = 'block';

        showMessage('Loading photos...', 'info');
        const { photos } = await fetchPhotos(folderName);
        currentPhotos = photos; // Store photos for lightbox
        displayPhotos(photos);
        showMessage('', 'clear');
    } catch (error) {
        handleAuthError(error);
    }
}

function displayFolders(folders) {
    const folderList = document.getElementById('folderList');
    folderList.innerHTML = '';
    document.getElementById('albumTitle').textContent = 'Select an Album';
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('gallery').innerHTML = '';

    if (!folders || folders.length === 0) {
        folderList.innerHTML = '<li>No albums yet.</li>';
        return;
    }
    
    folders.forEach(folder => {
        const li = document.createElement('li');
        li.textContent = folder;
        li.onclick = () => {
            document.querySelectorAll('#folderList li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            loadPhotos(folder);
        };
        folderList.appendChild(li);
    });
}

function displayPhotos(photos) {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '';
    
    if (!photos || photos.length === 0) {
        gallery.innerHTML = '<p class="empty-message">No photos in this album. Upload some!</p>';
        return;
    }
    
    photos.forEach((photo, index) => {
        const mediaContainer = document.createElement('div');
        mediaContainer.className = 'media-container';
        mediaContainer.onclick = () => openModal(index);

        const isVideo = photo.type.startsWith('video/');
        const mediaElement = document.createElement(isVideo ? 'video' : 'img');
        mediaElement.src = photo.url;
        if (!isVideo) mediaElement.alt = photo.name;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            handleDeletePhoto(photo.filename, photo.name);
        };
        
        mediaContainer.append(mediaElement, deleteBtn);
        gallery.appendChild(mediaContainer);
    });
}

async function handleCreateFolder() {
    const folderName = newFolderNameInput.value.trim();
    if (!folderName) return showMessage('Please enter an album name.', 'error');
    
    try {
        showMessage('Creating album...', 'info');
        await createFolder(folderName);
        newFolderNameInput.value = '';
        showMessage('Album created successfully!', 'success');
        loadGallery();
    } catch (error) {
        showMessage(`Failed to create album: ${error.message}`, 'error');
    }
}

async function handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
}

async function uploadFiles(files) {
    if (!currentFolder) return showMessage('Please select an album first.', 'error');
    
    const statusP = document.getElementById('status');
    statusP.textContent = `Uploading ${files.length} file(s)...`;
    
    const uploadPromises = Array.from(files).map(async (file) => {
        try {
            const { url } = await generateUploadUrl(file.name, currentFolder, file.type);
            await uploadFileToSignedUrl(url, file, file.type);
        } catch (error) {
            console.error(`Failed to upload ${file.name}:`, error);
        }
    });

    await Promise.all(uploadPromises);
    
    fileInput.value = ''; // Clear the file input
    statusP.textContent = `Upload complete!`;
    
    setTimeout(() => {
        statusP.textContent = '';
        loadPhotos(currentFolder);
    }, 2000);
}

// ============================================================================
// Drag and Drop Upload [ADDED BACK]
// ============================================================================

function setupDragAndDrop() {
    const galleryContainer = document.getElementById('gallery');
    
    galleryContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentFolder) { // Only show effect if a folder is selected
            galleryContainer.classList.add('drag-over');
        }
    });
    
    galleryContainer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        galleryContainer.classList.remove('drag-over');
    });
    
    galleryContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        galleryContainer.classList.remove('drag-over');
        
        if (!currentFolder) return; // Don't allow drop if no folder is selected

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            await uploadFiles(files);
        }
    });
}


async function handleDeletePhoto(filename, displayName) {
    if (!confirm(`Are you sure you want to delete "${displayName}"?`)) return;
    
    try {
        showMessage('Deleting photo...', 'info');
        await deletePhoto(filename);
        showMessage('Photo deleted successfully!', 'success');
        loadPhotos(currentFolder);
    } catch (error) {
        showMessage(`Failed to delete photo: ${error.message}`, 'error');
    }
}

function handleAuthError(error) {
    console.error('Authentication Error:', error);
    showMessage('Authentication error. Please sign in again.', 'error');
    handleSignOut();
}

// ============================================================================
// Lightbox Modal Logic
// ============================================================================

function openModal(index) {
    currentPhotoIndex = index;
    updateModalContent();
    document.getElementById('lightbox-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('lightbox-modal').style.display = 'none';
    document.getElementById('lightbox-video').pause();
}

function showPrevPhoto() {
    currentPhotoIndex = (currentPhotoIndex > 0) ? currentPhotoIndex - 1 : currentPhotos.length - 1;
    updateModalContent();
}

function showNextPhoto() {
    currentPhotoIndex = (currentPhotoIndex < currentPhotos.length - 1) ? currentPhotoIndex + 1 : 0;
    updateModalContent();
}

function updateModalContent() {
    if (currentPhotos.length === 0) return;
    const photo = currentPhotos[currentPhotoIndex];
    const img = document.getElementById('lightbox-img');
    const video = document.getElementById('lightbox-video');

    const isVideo = photo.type.startsWith('video/');
    img.style.display = isVideo ? 'none' : 'block';
    video.style.display = isVideo ? 'block' : 'none';

    if (isVideo) {
        video.src = photo.url;
        video.play();
    } else {
        video.pause();
        video.src = '';
        img.src = photo.url;
    }
}

async function downloadCurrentImage() {
    if (currentPhotos.length === 0) return;
    const photo = currentPhotos[currentPhotoIndex];
    try {
        const response = await fetch(photo.url);
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = photo.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('Download failed:', error);
        showMessage('Could not download file.', 'error');
    }
}