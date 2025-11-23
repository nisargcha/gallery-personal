<h1 align="center">🖼️ Personal Cloud Gallery</h1>

<p align="center">
  <b>A private, cloud-based photo gallery — upload, organize, and access your images securely from anywhere.</b>
</p>

<p align="center">
  <a href="https://github.com/nisargcha/gallery-personal"><img src="https://img.shields.io/badge/Source_Code-GitHub-181717?style=flat-square&logo=github" alt="Source Code"></a>
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black" alt="Firebase">
  <img src="https://img.shields.io/badge/Google_Cloud-4285F4?style=flat-square&logo=googlecloud&logoColor=white" alt="Google Cloud">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/Deployed_on-Cloud_Run-4285F4?style=flat-square&logo=googlecloudrun&logoColor=white" alt="Cloud Run">
</p>

---

## 🧾 Overview  

**Personal Cloud Gallery** is a self-hosted image gallery for personal use.

It lets you:
- Upload images to your own cloud.
- Organize them into albums.
- View and download them from anywhere.

The frontend is built using **pure HTML, CSS, and JavaScript** (no framework).  
The app is containerized with **Docker** and deployed using **Google Cloud Run**, with:
- **Firebase Authentication** for secure login.
- **Google Cloud Storage** for storing images.
- **Storage class optimization** (Standard / Nearline / Coldline) to reduce cost over time.

This is not a social media clone. It’s a personal “my photos, my storage” tool.

---

## ✨ Features  

| Feature | Description |
|---------|-------------|
| 🔐 Secure Login | User authentication via Firebase Auth (email / provider-based). |
| ☁️ Cloud Storage | Images stored in Google Cloud Storage buckets. |
| 🗂 Album Management | Create albums, group photos, keep things organized. |
| 👀 View & Download | Preview images in browser or download them locally. |
| 💸 Cost Optimization | Uses different Google Cloud Storage classes to manage cost for older / less-accessed photos. |
| 🚀 Cloud Hosted | App is served from a Docker image running on Google Cloud Run. |
| 📱 Responsive Frontend | Clean UI built with plain HTML, CSS, and JavaScript. |

---

## 🧩 Tech Stack  

| Area | Technology |
|------|------------|
| Frontend UI | HTML, CSS, JavaScript (vanilla) |
| Auth | Firebase Authentication |
| Storage | Google Cloud Storage (with lifecycle / storage class optimization) |
| Deployment | Docker image on Google Cloud Run |
| Tools | Git, VS Code, Google Cloud Console |

---

## 🏗️ Architecture  

1. **Frontend (HTML/CSS/JS)**  
   - Handles the UI for upload, album creation, listing photos, and downloading.

2. **Firebase Authentication**  
   - Protects access. Only authenticated users can manage or view private albums.

3. **Google Cloud Storage**  
   - Stores uploaded images.
   - Buckets are configured with lifecycle rules and storage classes to keep long-term storage cheap.

4. **Docker + Cloud Run**  
   - The app is packaged as a Docker image.
   - The container is deployed to Google Cloud Run for scalable, serverless hosting.

---

## 💡 Why This Project Exists  

I wanted a gallery that:
- I control.
- Doesn’t compress images to death.
- Isn’t public by default.
- Doesn’t force me into someone else’s platform.

This project taught me how to connect:
- Frontend (just HTML/JS)
- Auth (Firebase)
- Cloud infra (GCP Storage + Cloud Run)
- Deployment (Docker)

Basically: build something real, not just another to-do app.

---

## 🔮 Future Improvements  

- Client-side compression before upload (to save bandwidth).  
- Smart search / tagging for photos.  
- Shareable album links with access rules.  
- Activity log: when was this file uploaded / last downloaded.  
- Multi-user / family mode.

---

## 👨‍💻 Author  

**Nisarg Chaudhari**

📧 Email: sunisarg05@gmail.com  
🔗 GitHub: https://github.com/nisargcha

---

<p align="center">
  <i>⭐ If you like the idea, feel free to star or fork.</i><br>
  <b>Made with ☁️, Docker, and patience by Nisarg Chaudhari</b>
</p>
