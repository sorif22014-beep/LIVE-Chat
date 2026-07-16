# 🎤 Surokkha আড্ডা (সুরক্ষা আড্ডা)
### Bilingual WebRTC & Socket.IO Voice Group Chat Application

[বাংলা বর্ণনা নিচে দেওয়া হলো (Bengali Description below) 👇](#-বাংলা-বিবরণী)

**Surokkha আড্ডা (সুরক্ষা আড্ডা)** is a premium, lightweight, production-ready, and bilingual (English/Bengali) web application designed for group voice chats. Built using **React (with Tailwind CSS and Lucide Icons)** on the frontend, and **Node.js, Express, and Socket.IO** on the backend, this platform leverages the high-speed **WebRTC full mesh peer-to-peer network** for crystal-clear, low-latency audio transmission.

---

## 🚀 Key Features

- **Mesh-based WebRTC Audio**: Specifically optimized for voice (voice-only stream), permitting up to 10-20 concurrent users inside the same room with extremely low bandwidth overhead.
- **Link-based Joining**: Instantly create rooms and share joinable URL invites (e.g., `https://domain.com/?room=chat-code`).
- **Interactive Live Chat**: Text chat module featuring standard messages alongside quick emoji reaction bars for micro-interactions.
- **Raise Hand & Status Indicators**: Attendees can raise their hands to catch attention. Dynamic visual icons and status meters keep track of active speakers and muted mics.
- **Host Administration Controls**: The room's host can dynamically force-mute attendees, lower their raised hands, or kick them from the meeting.
- **Dynamic Host Re-assignment**: If the host disconnects, the system automatically assigns host status to the next oldest active participant in the room.
- **Real-Time Microphone Tester**: A volumetric visualizer bar on the lobby screen tests your microphone before joining, requesting browser permissions early and verifying audio input.
- **Complete Localization**: Dynamic toggle between English and Bengali across all forms, notifications, and visual overlays.

---

## 🛠️ Tech Stack & System Architecture

### Frontend
- **Framework**: React 19 + TypeScript (built via Vite).
- **Styling**: Tailwind CSS for mobile-first fully responsive screens.
- **Icons**: Lucide React.
- **Voice Playback Engine**: Custom React `<AudioPlayer>` nodes mapping incoming WebRTC streams directly, preventing garbage collection and browser silent failures.

### Backend & Real-Time Signaling
- **Server Framework**: Node.js & Express.
- **Socket Framework**: Socket.IO for room logic, state synchronization, and relaying WebRTC SDP Offers/Answers and ICE Candidates.
- **Voice Analyzer**: Web Audio API `AudioContext` combined with `AnalyserNode` to poll decibels and display neon glowing visual overlays around active speakers.

---

## 📦 Installation & Local Development

1. **Clone the repository**:
   ```bash
   git clone <your-github-repo-url>
   cd <repo-name>
   ```

2. **Install all dependencies**:
   ```bash
   npm install
   ```

3. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   *The server runs on http://localhost:3000.*

4. **Build for Production**:
   ```bash
   npm run build
   ```

5. **Start Production Server**:
   ```bash
   npm run start
   ```

---

## ☁️ Deployment on Render

This application is fully production-ready and optimized for zero-config deployments on **Render** (or Heroku, Cloud Run, etc.).

### Render Setup Instructions:
1. Go to **Render Dashboard** and click **New Web Service**.
2. Connect your GitHub repository.
3. Apply the following configurations:
   - **Environment**: `Node`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start`
   - **Environment Variables**:
     - `NODE_ENV`: `production`
4. Click **Deploy**. Render will build the Vite assets, package the Express server using `esbuild`, and boot the app on port 3000 automatically!

---

# 🇧🇩 বাংলা বিবরণী

**সুরক্ষা আড্ডা** হলো একটি প্রিমিয়াম, দ্রুতগতির এবং সম্পূর্ণ নিরাপদ দ্বিভাষিক (বাংলা/ইংরেজি) ভয়েস গ্রুপ চ্যাট ওয়েব অ্যাপ্লিকেশন। এটি মূলত বন্ধুদের সাথে আড্ডা, গ্রুপ ডিসকাশন বা টিম মিটিংয়ের জন্য তৈরি।

## 🌟 মূল বৈশিষ্ট্যাবলী

- **WebRTC ভয়েস আড্ডা**: অডিওর জন্য বিশেষভাবে তৈরি বিধায় এটি অত্যন্ত লাইটওয়েট এবং ১০-২০ জন ব্যবহারকারী একই রুমে যুক্ত হয়ে কোনো ল্যাগ ছাড়াই চমৎকার কোয়ালিটিতে কথা বলতে পারেন।
- **ইনভাইট লিংক শেয়ারিং**: সহজেই রুম তৈরি করে বন্ধুদের সাথে ইনভাইট লিংক শেয়ার করতে পারবেন (যেমন: `?room=room-id`)। লিংকে ক্লিক করলেই তারা সরাসরি রুমে যোগ দিতে পারবে।
- **লাইভ চ্যাট এবং ইমোজি**: ভয়েস চ্যাটের পাশাপাশি লাইভ টেক্সট চ্যাট এবং চটজলদি এক্সপ্রেস করার জন্য কুইক ইমোজি ট্যুলবার রয়েছে।
- **হাত তোলা (Raise Hand)**: দৃষ্টি আকর্ষণ করার জন্য যেকোনো মেম্বার হাত তুলতে পারেন যা স্ক্রিনে ও পার্টিসিপেন্ট লিস্টে সুন্দর নোটিফিকেশন সহ দেখাবে।
- **হোস্ট কন্ট্রোল (Host Controls)**: রুমের হোস্ট যেকোনো অংশগ্রহণকারীকে মিউট বা আনমিউট করতে পারেন, হাত নামিয়ে দিতে পারেন কিংবা সরাসরি রুম থেকে বের করে দিতে পারেন।
- **ডাইনামিক হোস্ট ট্রান্সফার**: কোনো কারণে হোস্ট চলে গেলে রুমে থাকা পরবর্তী সিনিয়র মেম্বার স্বয়ংক্রিয়ভাবে হোস্ট হয়ে যাবেন।
- **লাইভ মাইক্রোফোন লেভেল টেস্ট**: রুমে ঢোকার আগে লবিতেই ব্যবহারকারী তার মাইক্রোফোন পরীক্ষা করতে পারেন।
- **দ্বিভাষিক ইন্টারফেস**: এক ক্লিকেই সম্পূর্ণ অ্যাপ্লিকেশন বাংলা অথবা ইংরেজি ভাষায় কনভার্ট করা যায়।

## 💻 যেভাবে স্থানীয়ভাবে চালাবেন (Local Setup)

১. **প্রজেক্টটি ডাউনলোড করে ডিরেক্টরিতে যান**:
   ```bash
   cd <project-folder>
   ```
২. **ডিপেন্ডেন্সি ইনস্টল করুন**:
   ```bash
   npm install
   ```
৩. **ডেভেলপমেন্ট সার্ভার চালু করুন**:
   ```bash
   npm run dev
   ```
   *ব্রাউজারে যান: http://localhost:3000*

## 🚀 GitHub ও Render-এ আপলোড গাইড
এই অ্যাপ্লিকেশনটি **Render** প্ল্যাটফর্মে সরাসরি হোস্ট করার জন্য সম্পূর্ণ তৈরি। GitHub-এ আপনার নিজস্ব রিপোজিটরিতে কোডটি পুশ করুন এবং Render-এ একটি নতুন **Web Service** তৈরি করে কানেক্ট করুন। আপনার সার্ভিসটি নিমিষেই লাইভ হয়ে যাবে!

---
*Developed with ❤️ using WebRTC & Socket.IO. Open-sourced under the Apache-2.0 License.*
