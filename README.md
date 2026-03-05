# 👁️ Identity Verification System V9.2

An enterprise-grade, browser-based biometric facial recognition system. This application uses your webcam and advanced Machine Learning models to detect faces, analyze features, and match them against a local "criminal database" in real-time.

## ✨ Features
- **Real-Time Facial Recognition:** Powered by `face-api.js`, providing fast and accurate face detection directly in the browser.
- **Biometric Confidence Meter:** Displays real-time matching confidence scores.
- **Dynamic UI:** A highly polished, sci-fi "Enterprise" interface with Dark/Light theme toggles, scan lines, and alert overlays.
- **Local Database Management:** Add new target profiles (image, name, age, location) directly through the Admin Panel (Password secured).
- **Audio Feedback:** Synthesized voice alerts for system status and match confirmations.

## 🛠️ Tech Stack
- **Frontend:** HTML5, CSS3 (Custom Variables for Theming), Vanilla JavaScript
- **Machine Learning:** [face-api.js](https://justadudewhohacks.github.io/face-api.js/docs/index.html) running in the client browser.

## 🚀 Getting Started

### Prerequisites
You need a modern web browser and a webcam.

### Installation & Usage

1. Clone the repository:
   ```bash
   git clone https://github.com/amanamarjit243222/Face-recognition.git
   ```
2. Navigate to the directory:
   ```bash
   cd Face-recognition
   ```
3. Run a local server (required for loading the TFJS models via fetching):
   ```bash
   # Using Node.js
   npx serve ./
   
   # Using Python
   python -m http.server 8000
   ```
4. Open your browser to `http://localhost:8000`.
5. Allow webcam access when prompted.
6. *Admin Access Code:* The default passcode for adding new records into the database is **100**.

## 📸 Demo
![Face Recognition Interface](face_recognition_ui.png)

## 🤝 Contributing
Contributions, issues, and feature requests are welcome!

## 📄 License
This project is open-source.
