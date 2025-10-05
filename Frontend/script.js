// ====================================================================
// PASTE YOUR FIREBASE CONFIGURATION OBJECT HERE
// ====================================================================
const firebaseConfig = window.firebaseConfig;

firebase.initializeApp(firebaseConfig);

// --- GLOBAL VARIABLES & CONSTANTS ---
const BACKEND_URL = 'http://127.0.0.1:8080' || 'https://photo-gallery-service-913570853508.us-east1.run.app'; // Change to your Cloud Run URL when deployed
let currentFolder = null;
let idToken = null;
let currentGalleryFiles = [];
let currentLightboxIndex = 0;
let uiMode = 'signIn'; // 'signIn' or 'signUp'

// --- DOM ELEMENTS ---
const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const lightbox = document.getElementById('lightbox-modal');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxVideo = document.getElementById('lightbox-video');
const downloadBtn = document.getElementById('modal-download');
const auth = firebase.auth();
const authError = document.getElementById('auth-error');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleBtn = document.getElementById('auth-toggle');

// --- AUTHENTICATION ---
function handleAuthError(error) {
    console.error("Authentication Error:", error);
    let message = 'An unexpected error occurred. Please try again.';
    switch (error.code) {
        case 'auth/wrong-password':
            message = 'Incorrect password. Please try again.';
            break;
        case 'auth/user-not-found':
            message = 'No account found with this email address.';
            break;
        case 'auth/invalid-email':
            message = 'Please enter a valid email address.';
            break;
        case 'auth/email-already-in-use':
            message = 'An account already exists with this email address.';
            break;
        case 'auth/weak-password':
            message = 'The password must be at least 6 characters long.';
            break;
    }
    authError.innerText = message;
    authError.style.display = 'block';
}

function clearAuthError() {
    authError.innerText = '';
    authError.style.display = 'none';
}

auth.onAuthStateChanged(user => {
    if (user) {
        loginView.style.display = 'none';
        appView.style.display = 'flex';
        clearAuthError();
        user.getIdToken().then(token => {
            idToken = token;
            fetchFolders();
        });
    } else {
        idToken = null;
        loginView.style.display = 'block';
        appView.style.display = 'none';
    }
});

function signInWithGoogle() {
    clearAuthError();
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(handleAuthError);
}

function handleEmailPasswordSubmit(event) {
    event.preventDefault();
    clearAuthError();
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;

    if (uiMode === 'signIn') {
        auth.signInWithEmailAndPassword(email, password).catch(handleAuthError);
    } else {
        auth.createUserWithEmailAndPassword(email, password).catch(handleAuthError);
    }
}

function toggleUiMode() {
    clearAuthError();
    if (uiMode === 'signIn') {
        uiMode = 'signUp';
        authTitle.innerText = 'Create Account';
        authSubmitBtn.innerText = 'Sign Up';
        authToggleBtn.innerText = 'Have an account? Sign In';
    } else {
        uiMode = 'signIn';
        authTitle.innerText = 'Sign In';
        authSubmitBtn.innerText = 'Sign In';
        authToggleBtn.innerText = 'Need an account? Sign Up';
    }
}

function signOut() {
    auth.signOut();
}

// --- LIGHTBOX MODAL --- (No changes below this line, kept for completeness)
function updateLightboxContent() {
    const media = currentGalleryFiles[currentLightboxIndex];
    if (!media) return;
    const isVideo = media.filename.endsWith('.mp4') || media.filename.endsWith('.webm') || media.filename.endsWith('.mov');
    if (isVideo) {
        lightboxImg.style.display = 'none';
        lightboxVideo.style.display = 'block';
        lightboxVideo.src = media.url;
    } else {
        lightboxVideo.style.display = 'none';
        lightboxImg.style.display = 'block';
        lightboxImg.src = media.url;
    }
}

function openLightbox(index) {
    currentLightboxIndex = index;
    updateLightboxContent();
    lightbox.style.display = 'flex';
}

function closeLightbox() {
    lightbox.style.display = 'none';
    lightboxVideo.pause();
    lightboxImg.src = "";
    lightboxVideo.src = "";
}

function showNextMedia() {
    currentLightboxIndex++;
    if (currentLightboxIndex >= currentGalleryFiles.length) {
        currentLightboxIndex = 0;
    }
    updateLightboxContent();
}

function showPreviousMedia() {
    currentLightboxIndex--;
    if (currentLightboxIndex < 0) {
        currentLightboxIndex = currentGalleryFiles.length - 1;
    }
    updateLightboxContent();
}

async function forceDownload(url, filename) {
    const status = document.getElementById('status');
    status.innerText = 'Preparing download...';
    try {
        const response = await fetch(url);
        const data = await response.blob();
        const blobUrl = window.URL.createObjectURL(data);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(blobUrl);
        link.remove();
        status.innerText = 'Download started.';
        setTimeout(() => status.innerText = '', 2000);
    } catch (error) {
        console.error('Download failed:', error);
        status.innerText = 'Download failed.';
    }
}

// --- API & APP LOGIC ---
async function apiFetch(endpoint, options = {}) {
    if (!idToken) { alert("Authentication token is missing."); signOut(); return Promise.reject("Unauthorized"); }
    const headers = { ...options.headers, 'Authorization': `Bearer ${idToken}` };
    if (options.body) { headers['Content-Type'] = 'application/json'; }
    const response = await fetch(`${BACKEND_URL}${endpoint}`, { ...options, headers });
    if (response.status === 401 || response.status === 403) { alert("Session expired."); signOut(); throw new Error("Unauthorized"); }
    if (!response.ok) { const error = await response.json(); throw new Error(error.message || 'API error.'); }
    return response;
}

async function fetchFolders() {
    try {
        const response = await apiFetch('/get-folders');
        const folders = await response.json();
        const folderList = document.getElementById('folderList');
        folderList.innerHTML = '';
        folders.forEach(folder => {
            const li = document.createElement('li');
            li.textContent = folder;
            li.onclick = () => selectFolder(`${folder}/`);
            folderList.appendChild(li);
        });
    } catch (error) { console.error("Error fetching folders:", error); }
}

async function createFolder() {
    const folderName = document.getElementById('newFolderName').value.trim();
    if (!folderName) return;
    try {
        await apiFetch('/create-folder', { method: 'POST', body: JSON.stringify({ folder: `${folderName}/` }) });
        document.getElementById('newFolderName').value = '';
        fetchFolders();
    } catch (error) { console.error("Error creating folder:", error); }
}

function selectFolder(folder) {
    currentFolder = folder;
    const folderDisplayName = folder.slice(0, -1);
    document.getElementById('albumTitle').textContent = `Album: ${folderDisplayName}`;
    document.getElementById('uploadAlbumName').textContent = `"${folderDisplayName}"`;
    document.getElementById('uploadSection').style.display = 'block';
    document.querySelectorAll('#folderList li').forEach(li => { li.classList.toggle('active', li.textContent === folderDisplayName); });
    fetchPhotos();
}

async function fetchPhotos() {
    if (!currentFolder) return;
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '<p>Loading media...</p>';
    try {
        const response = await apiFetch(`/get-photos?folder=${encodeURIComponent(currentFolder)}`);
        currentGalleryFiles = await response.json();
        gallery.innerHTML = currentGalleryFiles.length === 0 ? '<p>No photos or videos yet.</p>' : '';
        currentGalleryFiles.forEach((media, index) => {
            const container = document.createElement('div');
            container.className = 'media-container';
            let mediaElement;
            const isVideo = media.filename.endsWith('.mp4') || media.filename.endsWith('.webm') || media.filename.endsWith('.mov');
            if (isVideo) {
                mediaElement = document.createElement('video');
                mediaElement.src = media.url;
                mediaElement.muted = true;
            } else {
                mediaElement = document.createElement('img');
                mediaElement.src = media.url;
            }
            mediaElement.loading = 'lazy';
            container.onclick = () => openLightbox(index);
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = (e) => { e.stopPropagation(); deletePhoto(media.filename); };
            container.appendChild(mediaElement);
            container.appendChild(deleteBtn);
            gallery.appendChild(container);
        });
    } catch (error) { console.error("Error fetching media:", error); gallery.innerHTML = '<p>Could not load media.</p>'; }
}

async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const files = fileInput.files;
    if (files.length === 0) { alert('Please select one or more files.'); return; }
    if (!currentFolder) { alert('Please select an album first.'); return; }
    const status = document.getElementById('status');
    status.innerText = `Preparing to upload ${files.length} file(s)...`;
    try {
        const uploadPromises = Array.from(files).map(async (file) => {
            const res = await apiFetch('/generate-upload-url', { method: 'POST', body: JSON.stringify({ filename: file.name, folder: currentFolder, contentType: file.type }) });
            const { url } = await res.json();
            await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
        });
        status.innerText = `Uploading ${files.length} file(s)...`;
        await Promise.all(uploadPromises);
        status.innerText = 'All uploads complete!';
        fileInput.value = '';
        setTimeout(() => status.innerText = '', 3000);
        fetchPhotos();
    } catch (error) { console.error("Error uploading files:", error); status.innerText = "An error occurred during upload."; }
}

async function deletePhoto(filename) {
    if (!confirm(`Are you sure you want to delete this photo?`)) return;
    try {
        await apiFetch('/delete-photo', { method: 'DELETE', body: JSON.stringify({ filename: filename }) });
        fetchPhotos();
    } catch (error) { console.error("Error deleting photo:", error); }
}

// --- EVENT LISTENERS ---
window.onload = function() {
    document.getElementById('google-signin-btn').onclick = signInWithGoogle;
    authForm.addEventListener('submit', handleEmailPasswordSubmit);
    authToggleBtn.onclick = toggleUiMode;
    document.getElementById('signout-btn').onclick = signOut;
    document.getElementById('create-folder-btn').onclick = createFolder;
    document.getElementById('upload-file-btn').onclick = uploadFile;
    document.getElementById('modal-close').onclick = closeLightbox;
    lightbox.onclick = function(event) {
        if (event.target === lightbox) {
            closeLightbox();
        }
    };
    document.getElementById('modal-prev').onclick = showPreviousMedia;
    document.getElementById('modal-next').onclick = showNextMedia;
    document.getElementById('modal-download').onclick = () => {
        const currentMedia = currentGalleryFiles[currentLightboxIndex];
        const filename = currentMedia.filename.split('/').pop();
        forceDownload(currentMedia.url, filename);
    };
    document.addEventListener('keydown', function (e) {
        if (lightbox.style.display === 'flex') {
            if (e.key === 'ArrowRight') showNextMedia();
            else if (e.key === 'ArrowLeft') showPreviousMedia();
            else if (e.key === 'Escape') closeLightbox();
        }
    });
};