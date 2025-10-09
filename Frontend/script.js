// Import authentication functions
import { signIn, signUp, signOutUser, onAuthStateChange, getIdToken, signInWithGoogle } from './auth.js';

// Configuration
const API_BASE_URL = 'https://photo-gallery-service-913570853508.us-east1.run.app';

// DOM Elements
let authSection, mainContent, loginForm, signupForm, signOutBtn, googleSignInBtn;
let currentFolder = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    setupEventListeners();
    setupAuthObserver();
});

function initializeElements() {
    authSection = document.getElementById('auth-section');
    mainContent = document.getElementById('main-content');
    loginForm = document.getElementById('login-form');
    signupForm = document.getElementById('signup-form');
    signOutBtn = document.getElementById('signout-btn');
    googleSignInBtn = document.getElementById('google-signin-btn');
}

function setupEventListeners() {
    // Login Form
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            await handleLogin(email, password);
        });
    }

    // Signup Form
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;
            await handleSignup(email, password);
        });
    }

    // Sign Out Button
    if (signOutBtn) {
        signOutBtn.addEventListener('click', handleSignOut);
    }
    
    // Google Sign In Button
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', handleGoogleSignIn);
    }

    // Toggle between login and signup
    const showSignupLink = document.getElementById('show-signup');
    const showLoginLink = document.getElementById('show-login');
    
    if (showSignupLink) {
        showSignupLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('signup-container').style.display = 'block';
        });
    }
    
    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('signup-container').style.display = 'none';
            document.getElementById('login-container').style.display = 'block';
        });
    }

    // Create Folder Button
    const createFolderBtn = document.getElementById('create-folder-btn');
    if (createFolderBtn) {
        createFolderBtn.addEventListener('click', showCreateFolderDialog);
    }

    // Upload Photos Button
    const uploadPhotosBtn = document.getElementById('upload-photos-btn');
    if (uploadPhotosBtn) {
        uploadPhotosBtn.addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
    }

    // File Input Change
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    // Back to Folders Button
    const backBtn = document.getElementById('back-to-folders-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            currentFolder = null;
            loadGallery();
        });
    }

    // Setup drag and drop
    setupDragAndDrop();
}

function setupAuthObserver() {
    onAuthStateChange((state) => {
        if (state.signedIn) {
            showMainContent();
            loadGallery();
        } else {
            showAuthSection();
        }
    });
}

async function handleLogin(email, password) {
    showMessage('Signing in...', 'info');
    const result = await signIn(email, password);
    
    if (result.success) {
        showMessage('Successfully signed in!', 'success');
    } else {
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
    
    if (result.success) {
        showMessage('Account created! Signing you in...', 'success');
    } else {
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

    if (result.success) {
        showMessage('Successfully signed in with Google!', 'success');
    } else {
        showMessage(`Google sign-in failed: ${result.error}`, 'error');
    }
}


function showAuthSection() {
    if (authSection) authSection.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'none';
}

function showMainContent() {
    if (authSection) authSection.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
}

// ============================================================================
// API Functions
// ============================================================================

async function apiFetch(endpoint, options = {}) {
    const token = await getIdToken();
    
    if (!token) {
        throw new Error('Not authenticated');
    }

    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, mergedOptions);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `API error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API fetch error:', error);
        throw error;
    }
}

async function fetchFolders() {
    try {
        return await apiFetch('/get-folders');
    } catch (error) {
        console.error('Error fetching folders:', error);
        throw error;
    }
}

async function fetchPhotos(folderName) {
    try {
        // FIXED: Changed from POST to GET with query parameter
        return await apiFetch(`/get-photos?folder=${encodeURIComponent(folderName)}`);
    } catch (error) {
        console.error('Error fetching photos:', error);
        throw error;
    }
}

async function createFolder(folderName) {
    try {
        return await apiFetch('/create-folder', {
            method: 'POST',
            body: JSON.stringify({ folder: folderName })
        });
    } catch (error) {
        console.error('Error creating folder:', error);
        throw error;
    }
}

async function generateUploadUrl(filename, folder, contentType) {
    try {
        return await apiFetch('/generate-upload-url', {
            method: 'POST',
            body: JSON.stringify({ filename, folder, contentType })
        });
    } catch (error) {
        console.error('Error generating upload URL:', error);
        throw error;
    }
}

async function uploadFileToSignedUrl(signedUrl, file, contentType) {
    try {
        const response = await fetch(signedUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': contentType
            },
            body: file
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error uploading file:', error);
        throw error;
    }
}

async function deletePhoto(filename) {
    try {
        return await apiFetch('/delete-photo', {
            method: 'DELETE',
            body: JSON.stringify({ filename })
        });
    } catch (error) {
        console.error('Error deleting photo:', error);
        throw error;
    }
}

async function deleteFolder(folderName) {
    try {
        return await apiFetch('/delete-folder', {
            method: 'DELETE',
            body: JSON.stringify({ folder: folderName })
        });
    } catch (error) {
        console.error('Error deleting folder:', error);
        throw error;
    }
}

// ============================================================================
// UI Functions
// ============================================================================

async function loadGallery() {
    try {
        showMessage('Loading folders...', 'info');
        const data = await fetchFolders();
        displayFolders(data.folders);
        showMessage('', 'clear');
        
        // Hide photo controls, show folder controls
        toggleControls('folders');
    } catch (error) {
        handleAuthError(error);
    }
}

async function loadPhotos(folderName) {
    try {
        currentFolder = folderName;
        showMessage('Loading photos...', 'info');
        const data = await fetchPhotos(folderName);
        displayPhotos(data.photos);
        showMessage('', 'clear');
        
        // Show photo controls, hide folder controls
        toggleControls('photos');
    } catch (error) {
        handleAuthError(error);
    }
}

function displayFolders(folders) {
    const foldersContainer = document.getElementById('folders-container');
    const photosContainer = document.getElementById('photos-container');
    
    if (!foldersContainer) return;
    
    // Show folders, hide photos
    foldersContainer.style.display = 'grid';
    if (photosContainer) photosContainer.style.display = 'none';
    
    foldersContainer.innerHTML = '';
    
    if (folders.length === 0) {
        foldersContainer.innerHTML = '<p class="empty-message">No albums yet. Create your first album!</p>';
        return;
    }
    
    folders.forEach(folder => {
        const folderElement = document.createElement('div');
        folderElement.className = 'folder-item';
        folderElement.innerHTML = `
            <i class="folder-icon">📁</i>
            <span class="folder-name">${folder}</span>
            <div class="folder-actions">
                <button class="delete-btn" data-folder="${folder}" title="Delete album">🗑️</button>
            </div>
        `;
        
        // Click folder to open
        folderElement.querySelector('.folder-name').addEventListener('click', () => loadPhotos(folder));
        folderElement.querySelector('.folder-icon').addEventListener('click', () => loadPhotos(folder));
        
        // Delete button
        folderElement.querySelector('.delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await handleDeleteFolder(folder);
        });
        
        foldersContainer.appendChild(folderElement);
    });
}

function displayPhotos(photos) {
    const foldersContainer = document.getElementById('folders-container');
    const photosContainer = document.getElementById('photos-container');
    
    if (!photosContainer) return;
    
    // Hide folders, show photos
    if (foldersContainer) foldersContainer.style.display = 'none';
    photosContainer.style.display = 'grid';
    
    photosContainer.innerHTML = '';
    
    if (photos.length === 0) {
        photosContainer.innerHTML = '<p class="empty-message">No photos in this album. Upload some!</p>';
        return;
    }
    
    photos.forEach(photo => {
        const photoElement = document.createElement('div');
        photoElement.className = 'photo-item';
        
        const isVideo = photo.type && photo.type.startsWith('video/');
        
        photoElement.innerHTML = `
            ${isVideo ? 
                `<video src="${photo.url}" controls loading="lazy"></video>` :
                `<img src="${photo.url}" alt="${photo.name}" loading="lazy">`
            }
            <div class="photo-info">
                <p class="photo-name">${photo.name}</p>
                <button class="delete-photo-btn" data-filename="${photo.filename}" title="Delete">🗑️</button>
            </div>
        `;
        
        // Delete button
        photoElement.querySelector('.delete-photo-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await handleDeletePhoto(photo.filename, photo.name);
        });
        
        photosContainer.appendChild(photoElement);
    });
}

function toggleControls(view) {
    const createFolderBtn = document.getElementById('create-folder-btn');
    const uploadPhotosBtn = document.getElementById('upload-photos-btn');
    const backBtn = document.getElementById('back-to-folders-btn');
    
    if (view === 'folders') {
        if (createFolderBtn) createFolderBtn.style.display = 'inline-block';
        if (uploadPhotosBtn) uploadPhotosBtn.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
    } else if (view === 'photos') {
        if (createFolderBtn) createFolderBtn.style.display = 'none';
        if (uploadPhotosBtn) uploadPhotosBtn.style.display = 'inline-block';
        if (backBtn) backBtn.style.display = 'inline-block';
    }
}

// ============================================================================
// Create Folder
// ============================================================================

function showCreateFolderDialog() {
    const folderName = prompt('Enter album name:');
    
    if (!folderName) return;
    
    // Validate folder name
    if (!/^[a-zA-Z0-9-_]+$/.test(folderName)) {
        showMessage('Album name can only contain letters, numbers, hyphens, and underscores', 'error');
        return;
    }
    
    handleCreateFolder(folderName);
}

async function handleCreateFolder(folderName) {
    try {
        showMessage('Creating album...', 'info');
        await createFolder(folderName);
        showMessage('Album created successfully!', 'success');
        loadGallery();
    } catch (error) {
        showMessage(`Failed to create album: ${error.message}`, 'error');
    }
}

// ============================================================================
// Upload Photos
// ============================================================================

async function handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    await uploadFiles(files);
}

async function uploadFiles(files) {
    if (!currentFolder) {
        showMessage('Please select an album first', 'error');
        return;
    }
    
    const fileArray = Array.from(files);
    const totalFiles = fileArray.length;
    let uploadedCount = 0;
    let failedCount = 0;
    
    showMessage(`Uploading ${totalFiles} file(s)...`, 'info');
    
    for (const file of fileArray) {
        try {
            // Check file size (max 100MB)
            if (file.size > 100 * 1024 * 1024) {
                console.error(`File ${file.name} is too large (max 100MB)`);
                failedCount++;
                continue;
            }
            
            // Get signed upload URL
            const { url } = await generateUploadUrl(file.name, currentFolder, file.type);
            
            // Upload file
            await uploadFileToSignedUrl(url, file, file.type);
            
            uploadedCount++;
            showMessage(`Uploaded ${uploadedCount}/${totalFiles} files...`, 'info');
        } catch (error) {
            console.error(`Failed to upload ${file.name}:`, error);
            failedCount++;
        }
    }
    
    // Clear file input
    document.getElementById('file-input').value = '';
    
    // Show result
    if (failedCount === 0) {
        showMessage(`Successfully uploaded ${uploadedCount} file(s)!`, 'success');
    } else {
        showMessage(`Uploaded ${uploadedCount}, failed ${failedCount} file(s)`, 'error');
    }
    
    // Reload photos
    loadPhotos(currentFolder);
}

// ============================================================================
// Drag and Drop Upload
// ============================================================================

function setupDragAndDrop() {
    const photosContainer = document.getElementById('photos-container');
    
    if (!photosContainer) return;
    
    photosContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        photosContainer.classList.add('drag-over');
    });
    
    photosContainer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        photosContainer.classList.remove('drag-over');
    });
    
    photosContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        photosContainer.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            await uploadFiles(files);
        }
    });
}

// ============================================================================
// Delete Functions
// ============================================================================

async function handleDeletePhoto(filename, displayName) {
    if (!confirm(`Delete "${displayName}"?`)) return;
    
    try {
        showMessage('Deleting photo...', 'info');
        await deletePhoto(filename);
        showMessage('Photo deleted successfully!', 'success');
        loadPhotos(currentFolder);
    } catch (error) {
        showMessage(`Failed to delete photo: ${error.message}`, 'error');
    }
}

async function handleDeleteFolder(folderName) {
    if (!confirm(`Delete album "${folderName}" and all its contents? This cannot be undone.`)) return;
    
    try {
        showMessage('Deleting album...', 'info');
        await deleteFolder(folderName);
        showMessage('Album deleted successfully!', 'success');
        loadGallery();
    } catch (error) {
        showMessage(`Failed to delete album: ${error.message}`, 'error');
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

function handleAuthError(error) {
    console.error('Authentication Error:', error);
    showMessage('Authentication error. Please sign in again.', 'error');
    handleSignOut();
}

function showMessage(message, type) {
    const messageDiv = document.getElementById('message');
    if (!messageDiv) return;
    
    if (type === 'clear') {
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