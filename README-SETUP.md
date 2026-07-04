# UGC Video Generator - Setup & Run Guide

## Prerequisites

- Node.js v20+
- `ffmpeg` installed and on `PATH` (used to stitch AI-generated scene clips together)
- AWS S3 bucket with CORS enabled
- Google Gemini API key (also used for Veo video generation)
- Laozhang API key (for GPT-5 prompt text generation)

## Quick Start

### 1. Configure Environment Variables

**Backend** (`backend/.env`):

You need to add your actual credentials to `backend/.env`:

```bash
# Edit backend/.env and add these values:

# Server
PORT=3000

# AWS S3 - REQUIRED - Get these from AWS Console
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_actual_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_actual_aws_secret_key_here
AWS_S3_BUCKET=your_s3_bucket_name_here

# Google Gemini - REQUIRED - Get from https://makersuite.google.com/app/apikey
# Also used for Veo video generation (Veo is served through the same Gemini API)
GOOGLE_GEMINI_API_KEY=your_actual_gemini_api_key_here
VEO_MODEL=veo-3.1-fast-generate-preview
VEO_ASPECT_RATIO=9:16
VEO_RESOLUTION=720p

# Laozhang - REQUIRED for prompt variant generation (GPT-5)
LAOZHANG_API_KEY=your_laozhang_api_key

# CORS
CORS_ORIGIN=http://localhost:5173

# Optional: skip real (billed) AI calls during local development
# MOCK_ANALYSIS=true
# MOCK_VIDEO_GENERATION=true
```

**Frontend** (`frontend/.env`):
```bash
# Already created - default values should work:
VITE_API_BASE_URL=http://localhost:3000/api
VITE_ENV=development
```

### 2. Start Backend Server

Once you've configured `backend/.env` with your actual credentials:

```bash
cd backend
npm run start:dev
```

The backend will start on **http://localhost:3000**

You should see:
```
[Nest] INFO [NestFactory] Starting Nest application...
[Nest] INFO [InstanceLoader] AppModule dependencies initialized
[Nest] INFO [NestApplication] Nest application successfully started
```

### 3. Start Frontend Dev Server (in a new terminal)

```bash
cd frontend
npm run dev
```

The frontend will start on **http://localhost:5173**

### 4. Test the Application

1. Open your browser to **http://localhost:5173**
2. You should see the UGC Video Generator interface
3. Click "Select Video File" and choose an MP4, MOV, or AVI file (max 100MB)
4. Click "Upload Video"
5. Wait for the upload to complete
6. The AI analysis will start automatically
7. After 30-60 seconds, you'll see the scene breakdown
8. You can edit the analysis by clicking "Edit"

## What's Working

✅ Video file upload with validation
✅ Direct browser-to-S3 upload via presigned URLs
✅ Google Gemini AI structured video analysis (hooks, per-scene pacing/cuts, captions)
✅ Scene-by-scene breakdown display with editable JSON
✅ Batch hook/prompt variant generation (GPT-5) with per-scene Veo prompts
✅ Multi-clip video generation with Google Veo 3/3.1 + `ffmpeg` stitching
✅ Batch generation and side-by-side comparison of multiple video variants
✅ Progress indicators (including per-scene render status)
✅ Error handling

## Troubleshooting

### Backend won't start
- Check that port 3000 is available
- Verify AWS credentials are correct
- Ensure Google Gemini API key is valid

### Upload fails
- Check AWS S3 bucket CORS configuration
- Verify AWS credentials have S3 write permissions
- Ensure file is under 100MB and is MP4/MOV/AVI format

### Analysis hangs
- Check Google Gemini API key is valid
- Verify video uploaded successfully to S3
- Check backend console for error messages

### Video generation fails or times out
- Check that `ffmpeg` is installed and available on `PATH` (`ffmpeg -version`)
- Verify the Gemini/Veo API key has access to the configured `VEO_MODEL`
- Check backend console for per-scene error messages
- Try `MOCK_VIDEO_GENERATION=true` locally to confirm the stitching pipeline itself works

## S3 CORS Configuration

Your S3 bucket needs this CORS policy:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["http://localhost:5173"],
    "ExposeHeaders": ["ETag"]
  }
]
```

## API Endpoints Available

- `POST /api/sessions/:sessionId/video/upload-url` - Get presigned upload URL
- `POST /api/sessions/:sessionId/analysis` - Trigger video analysis
- `GET /api/sessions/:sessionId/analysis` - Get analysis status/results
- `PATCH /api/sessions/:sessionId/analysis` - Update analysis with edits
- `POST /api/sessions/:sessionId/product` - Submit product info
- `POST /api/sessions/:sessionId/product/image/upload` - Upload product image
- `POST /api/sessions/:sessionId/prompt/variants` - Generate a batch of hook/prompt variants
- `GET /api/sessions/:sessionId/prompt/variants` - Get current prompt variants
- `PATCH /api/sessions/:sessionId/prompt/variants/:variantId` - Edit a single variant
- `POST /api/sessions/:sessionId/prompt/variants/:variantId/approve` - Approve a variant
- `POST /api/sessions/:sessionId/generate` - Batch-generate videos for all approved variants
- `GET /api/sessions/:sessionId/generate` - Poll status of all generated video variants

## Development Commands

### Backend
```bash
npm run start:dev    # Start with hot-reload
npm run build        # Build for production
npm run lint         # Run ESLint
npm run test         # Run tests
```

### Frontend
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```
