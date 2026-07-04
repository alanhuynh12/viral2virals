import React, { useState, useEffect } from 'react';
import { GenerationPromptVariant } from '../types';

interface VariantCardProps {
  variant: GenerationPromptVariant;
  onUpdate: (variantId: string, editedText: string) => void;
  onApprove: (variantId: string) => void;
  isUpdating: boolean;
  isApproving: boolean;
}

const MAX_VARIANT_TEXT_LENGTH = 10000;

const VariantCard: React.FC<VariantCardProps> = ({
  variant,
  onUpdate,
  onApprove,
  isUpdating,
  isApproving,
}) => {
  const [editedText, setEditedText] = useState(variant.finalSummaryText);
  const [hasChanges, setHasChanges] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    setEditedText(variant.finalSummaryText);
    setHasChanges(false);
  }, [variant.finalSummaryText]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_VARIANT_TEXT_LENGTH) {
      setEditedText(value);
      setHasChanges(value !== variant.finalSummaryText);
    }
  };

  const handleUpdate = () => {
    if (editedText.trim() && hasChanges) {
      onUpdate(variant.variantId, editedText);
      setHasChanges(false);
    }
  };

  const handleApprove = () => {
    if (hasChanges && editedText.trim()) {
      onUpdate(variant.variantId, editedText);
    }
    onApprove(variant.variantId);
  };

  const charsRemaining = MAX_VARIANT_TEXT_LENGTH - editedText.length;
  const isFlagged = variant.moderationStatus === 'flagged';
  const isApproved = variant.approvedAt !== undefined;

  return (
    <div
      className={`bg-white rounded-lg shadow p-6 border-2 ${
        isApproved ? 'border-green-400' : 'border-transparent'
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 mb-2">
            {variant.hookLabel}
          </span>
          <h3 className="text-lg font-bold text-gray-900">
            {variant.scenePrompts.length} scene
            {variant.scenePrompts.length !== 1 ? 's' : ''}
          </h3>
        </div>
        {isApproved && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            ✓ Approved
          </span>
        )}
      </div>

      {/* Scene summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {variant.scenePrompts.map((sp) => (
          <span
            key={sp.sceneIndex}
            className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md capitalize"
            title={sp.text}
          >
            {sp.sceneIndex + 1}. {sp.purpose} ({sp.durationSeconds}s)
          </span>
        ))}
      </div>

      {isFlagged && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            Flagged: {variant.moderationFlags?.join(', ')}. Review and edit, or
            click "Approve Anyway" to proceed.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="text-sm text-blue-600 hover:text-blue-800 mb-2"
      >
        {showRaw ? 'Hide' : 'Edit'} per-scene Veo prompts (JSON)
      </button>

      {showRaw && (
        <div className="mb-4">
          <textarea
            value={editedText}
            onChange={handleTextChange}
            disabled={isUpdating || isApproving}
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-900 font-mono text-xs"
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-500">
              {editedText.trim() ? '✓ Valid' : '⚠ Cannot be empty'}
            </span>
            <span
              className={`text-xs ${
                charsRemaining < 200
                  ? 'text-orange-500 font-medium'
                  : 'text-gray-500'
              }`}
            >
              {charsRemaining} characters remaining
            </span>
          </div>
          {hasChanges && (
            <button
              onClick={handleUpdate}
              disabled={isUpdating || !editedText.trim() || isApproving}
              className="mt-2 w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
            >
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleApprove}
        disabled={
          isApproving ||
          isUpdating ||
          !editedText.trim() ||
          (isApproved && !hasChanges)
        }
        className={`w-full px-4 py-2 rounded-md transition-colors ${
          isFlagged
            ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
            : 'bg-green-600 hover:bg-green-700 text-white'
        } disabled:bg-gray-300 disabled:cursor-not-allowed`}
      >
        {isApproving
          ? 'Approving...'
          : isFlagged
            ? 'Approve Anyway'
            : isApproved
              ? 'Approved ✓'
              : 'Approve This Variant'}
      </button>
    </div>
  );
};

interface PromptVariantsEditorProps {
  variants: GenerationPromptVariant[];
  onUpdate: (variantId: string, editedText: string) => void;
  onApprove: (variantId: string) => void;
  updatingVariantIds: string[];
  approvingVariantIds: string[];
  onContinue: () => void;
}

export const PromptVariantsEditor: React.FC<PromptVariantsEditorProps> = ({
  variants,
  onUpdate,
  onApprove,
  updatingVariantIds,
  approvingVariantIds,
  onContinue,
}) => {
  const approvedCount = variants.filter((v) => v.approvedAt).length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-2">Choose Your Hooks</h2>
        <p className="text-gray-600">
          Each card below is a different hook angle for your fast-paced ad,
          broken into per-scene prompts. Approve one or more variants to
          generate multiple advertisement videos in a single batch.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {variants.map((variant) => (
          <VariantCard
            key={variant.variantId}
            variant={variant}
            onUpdate={onUpdate}
            onApprove={onApprove}
            isUpdating={updatingVariantIds.includes(variant.variantId)}
            isApproving={approvingVariantIds.includes(variant.variantId)}
          />
        ))}
      </div>

      {approvedCount > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <button
            onClick={onContinue}
            className="w-full bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Continue with {approvedCount} approved variant
            {approvedCount !== 1 ? 's' : ''} →
          </button>
        </div>
      )}
    </div>
  );
};
