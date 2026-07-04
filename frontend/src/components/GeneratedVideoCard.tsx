import React from 'react';
import { GeneratedVideoVariant } from '../types';
import { VideoPlayer } from './VideoPlayer';

interface GeneratedVideoCardProps {
  video: GeneratedVideoVariant;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued',
  processing: 'Rendering',
  complete: 'Complete',
  failed: 'Failed',
};

/**
 * GeneratedVideoCard displays a single video variant: either its finished
 * player + download button, or a per-scene rendering progress list while
 * Veo is still generating/stitching the clips.
 */
export const GeneratedVideoCard: React.FC<GeneratedVideoCardProps> = ({
  video,
}) => {
  if (video.status === 'complete' && video.downloadUrl) {
    return (
      <div>
        <div className="mb-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            {video.hookLabel}
          </span>
        </div>
        <VideoPlayer
          videoUrl={video.downloadUrl}
          title={video.hookLabel}
          downloadUrl={video.downloadUrl}
          className="bg-white rounded-lg shadow p-6"
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
          {video.hookLabel}
        </span>
        <span
          className={`text-sm font-medium ${
            video.status === 'failed' ? 'text-red-600' : 'text-gray-600'
          }`}
        >
          {STATUS_LABEL[video.status] || video.status}
        </span>
      </div>

      <div className="space-y-2">
        {video.sceneClips.map((clip) => (
          <div
            key={clip.sceneIndex}
            className="flex items-center justify-between text-sm py-1.5 px-3 rounded-md bg-gray-50"
          >
            <span className="capitalize text-gray-700">
              Scene {clip.sceneIndex + 1}: {clip.purpose}
            </span>
            <span
              className={
                clip.status === 'complete'
                  ? 'text-green-600'
                  : clip.status === 'failed'
                    ? 'text-red-600'
                    : clip.status === 'processing'
                      ? 'text-blue-600'
                      : 'text-gray-400'
              }
            >
              {clip.status === 'processing' && (
                <span className="inline-block h-3 w-3 mr-1 rounded-full border-2 border-blue-600 border-t-transparent animate-spin align-middle" />
              )}
              {STATUS_LABEL[clip.status] || clip.status}
            </span>
          </div>
        ))}
      </div>

      {video.status === 'failed' && video.error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{video.error.message}</p>
        </div>
      )}
    </div>
  );
};
