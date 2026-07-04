# viral2viral - UGC Advertisement Video Generator

An AI-powered application that analyzes successful UGC (User-Generated Content) advertisement videos and generates new, fast-paced, TikTok/Reels-style promotional videos for your products based on the same style and techniques.

## Overview

viral2viral allows marketers to upload a reference UGC advertisement video, extracts a structured scene-by-scene breakdown using AI (hook classification, per-scene pacing/cuts, on-screen captions, audio), and then generates several brand-new advertisement video variants for their product - each rendered scene-by-scene with Google Veo and stitched into a fast-paced vertical video - while maintaining the successful elements of the original.

**[Watch Demo on YouTube](https://youtu.be/Ylw-e1AayGE)**

**Built with [GitHub Spec Kit](https://github.com/github/spec-kit)**

## Features

- **Video Upload & Structured Analysis**: Upload UGC advertisement videos (MP4, MOV, AVI up to 100MB) and get an AI-powered, structured scene-by-scene breakdown: hook classification, per-scene cut timing, on-screen captions, and objective pacing metrics (cut count, average shot length)
- **Product Customization**: Input your product details (name, description, image) to personalize the generated advertisement
- **Batch Hook/Prompt Variants**: Automatically generate several distinct hook angles (pattern interrupt, bold claim, question, relatable problem, visual shock, social proof), each broken into per-scene Veo prompts, with built-in content moderation
- **Multi-Clip Video Generation**: Each approved variant is rendered scene-by-scene with Google Veo 3/3.1 and stitched into a single fast-paced vertical (9:16) video with `ffmpeg` - instead of relying on one monolithic generation call
- **Side-by-Side Comparison**: View the original video alongside every generated variant to compare results
- **Cloud Storage**: All videos and assets are stored securely in AWS S3

## Tech Stack

### Backend
- **Framework**: NestJS (Node.js/TypeScript)
- **Video Analysis**: Google Gemini 2.5 Flash API (structured JSON scene/hook/caption extraction)
- **Text Generation**: OpenAI GPT-5 (via Laozhang API) - generates per-scene Veo prompts for multiple hook variants
- **Video Generation**: Google Veo 3 / 3.1 (`veo-3.0-generate-001`, `veo-3.1-generate-preview`, or their `-fast` variants) via `@google/genai`
- **Video Assembly**: `ffmpeg` for normalizing and concatenating per-scene clips into one stitched video
- **Storage**: AWS S3 with presigned URLs
- **Architecture**: Modular structure with separate services for analysis, generation (Veo + stitching), prompts, products, storage, and sessions

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **State Management**: Custom hooks (`useWorkflow`)
- **API Client**: Axios

### Infrastructure
- Session-based workflow management (no authentication required for MVP)
- RESTful API with modular controllers
- File upload handling with Multer
- Environment-based configuration

## Project Structure

```
viral2viral/
├── backend/              # NestJS API server
│   └── src/
│       ├── modules/      # Feature modules
│       │   ├── analysis/ # Structured video analysis with Gemini
│       │   ├── generation/ # Veo multi-clip generation + ffmpeg stitching
│       │   ├── prompt/   # Batch hook/prompt variant generation & moderation
│       │   ├── product/  # Product information management
│       │   ├── sessions/ # Session state management
│       │   ├── storage/  # AWS S3 integration
│       │   └── video/    # Video upload handling
│       ├── common/       # Shared utilities & types
│       └── config/       # Configuration management
├── frontend/             # React SPA
│   └── src/
│       ├── components/   # UI components
│       ├── hooks/        # Custom React hooks
│       ├── services/     # API client
│       └── types/        # TypeScript definitions
├── scripts/              # Testing & utility scripts
│   └── output/          # Example generated videos
└── specs/               # Spec-First development docs
    └── 001-ugc-video-generator/
```

## Example Output

See example generated videos in [`scripts/output/`](scripts/output/):
- `generated-26.11.25.mp4` - Generated advertisement video

## Getting Started

### Prerequisites
- Node.js 18+
- `ffmpeg` available on the backend host (used to stitch scene clips together)
- AWS account with S3 bucket configured
- API keys for:
  - Google Gemini API (also used for Veo video generation)
  - Laozhang API (for GPT-5 prompt text generation)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/IuriiD/viral2viral.git
cd viral2viral
```

2. Install dependencies:
```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

3. Configure environment variables:
```bash
# Backend: create backend/.env
cp backend/.env.example backend/.env
# Add your API keys and AWS credentials

# Frontend: create frontend/.env
cp frontend/.env.example frontend/.env
# Configure API endpoint
```

4. Start the development servers:
```bash
# Terminal 1: Start backend (port 3000)
cd backend
npm run start:dev

# Terminal 2: Start frontend (port 5173)
cd frontend
npm run dev
```

5. Open http://localhost:5173 in your browser

## Workflow

1. **Upload Reference Video**: Upload a successful UGC advertisement video
2. **Analyze**: AI extracts a structured scene-by-scene breakdown (hook type, per-scene pacing/cuts, captions, cut count, average shot length)
3. **Edit Analysis**: Review and modify the analysis JSON if needed
4. **Add Product Info**: Enter your product name, description, and upload product image (optional)
5. **Generate Hook Variants**: AI generates several distinct hook angles, each with its own set of per-scene Veo prompts
6. **Moderate & Approve**: Review, edit, and approve one or more variants
7. **Generate Videos**: Each approved variant is rendered scene-by-scene with Veo and stitched into a fast-paced vertical video
8. **Compare**: View the original video alongside every generated variant, with per-scene render progress
9. **Download**: Save any of the generated videos

## Video Generation Architecture

Rather than sending one large prompt to a text-to-video model and hoping it produces the right number of cuts, each approved hook variant is generated **scene-by-scene**:

1. The structured analysis breaks the source video into 3-6 scenes (hook/problem/solution/benefit/cta) with per-scene duration, pacing, and captions.
2. GPT-5 turns each scene into its own Veo-ready text prompt (subject/action, camera, dialogue in quotes, SFX) for every hook variant.
3. Each scene is rendered as an independent Veo clip (4/6/8s, snapped from the source scene's duration), optionally anchoring the first scene with the uploaded product image.
4. All scene clips for a variant are normalized (resolution/fps/codec) and concatenated with `ffmpeg` into a single stitched vertical (9:16) video.
5. The stitched video is uploaded to S3 and returned to the user for playback/download.

This keeps cut timing, pacing, and per-scene dialogue much closer to the original fast-paced source video than a single monolithic generation call.

For local development without incurring API costs, set `MOCK_ANALYSIS=true` and `MOCK_VIDEO_GENERATION=true` in `backend/.env` - this synthesizes placeholder clips with `ffmpeg` so the full multi-clip + batch-variant pipeline can be exercised end-to-end for free.

## API Documentation

See [specs/001-ugc-video-generator/contracts/openapi.yaml](specs/001-ugc-video-generator/contracts/openapi.yaml) for full API specification.

## Deployment

### Frontend → Vercel

The frontend is a static Vite/React build and deploys to Vercel with zero friction (`frontend/vercel.json` is included, framework auto-detected).

1. Import the repo into Vercel, set the project **Root Directory** to `frontend`.
2. Set the environment variable `VITE_API_BASE_URL` to your deployed backend's URL (e.g. `https://your-backend.example.com/api`).
3. Deploy - build command `npm run build`, output directory `dist` (already configured in `vercel.json`).

Or via the CLI: `cd frontend && vercel --prod` (requires a Vercel account/token).

### Backend → Railway / Render / Fly.io / any Docker host (not Vercel)

**The backend intentionally does not deploy to Vercel serverless functions.** It relies on:
- in-memory session state that must survive across requests (a `Map`, not a database) - serverless functions are stateless and can hit a different cold instance per request, silently losing session data
- the `ffmpeg` binary for stitching per-scene Veo clips together
- long-running (potentially 10-30+ minute) batch AI video generation jobs that don't fit within serverless function time limits

Instead, it ships as a `Dockerfile` (`backend/Dockerfile`) that runs as a normal persistent container - a great fit for Railway, Render, Fly.io, Google Cloud Run (with `min-instances >= 1`), or any VM:

- **Railway**: connect the repo, set root directory to `backend` - `backend/railway.json` configures the Dockerfile build and health check automatically.
- **Render**: use the included `render.yaml` Blueprint at the repo root (`render.yaml` → Blueprints → New Blueprint Instance), or manually create a Web Service with Docker runtime pointing at `backend/Dockerfile`.
- **Fly.io / Cloud Run / any Docker host**: `docker build -t viral2viral-backend ./backend && docker run -p 3000:3000 --env-file backend/.env viral2viral-backend`, or use each platform's native Dockerfile deploy flow.

In all cases, configure the same environment variables as `backend/.env.example`, and set the frontend's `VITE_API_BASE_URL` to point at the deployed backend, and the backend's `CORS_ORIGIN` to point at the deployed frontend.

## Development

- **Backend Tests**: `cd backend && npm test`
- **Frontend Tests**: `cd frontend && npm test`
- **Linting**: `npm run lint` in respective directories
- **Formatting**: `npm run format` in respective directories

## License

UNLICENSED - Private project

## Contributing

This project follows spec-first development practices. See [specs/001-ugc-video-generator/](specs/001-ugc-video-generator/) for detailed specifications and development plans.
