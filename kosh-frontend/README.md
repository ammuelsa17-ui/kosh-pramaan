# KOSH-PRAMAAN Frontend (SIH26265)

React + Vite frontend for the KOSH-PRAMAAN FDR Lifecycle Management prototype.

## Prerequisites
- Node.js v18+ or v26+
- NPM v10+

## Setup & Running

### 1. Install Dependencies
```bash
cd kosh-frontend
npm install
```

### 2. Run in Development Mode
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### 3. Production Build
```bash
npm run build
```

### 4. Integration with Backend
The frontend connects to the Express backend running on `http://localhost:5001`.
- Health status check: `GET http://localhost:5001/api/health`
- Real-time indicator automatically updates to **"Backend Connected"** upon successful HTTP 200 response, or displays a diagnostic error state with a retry option if the backend is down.
