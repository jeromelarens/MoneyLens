import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { financialService } from '../services/financial.service';
import type { FinancialAccount, ImportJob } from '@moneylens/shared';
import { ApiClientError } from '../lib/api-client';

interface FileUploadZoneProps {
  accounts: FinancialAccount[];
  onImportSuccess: (job: ImportJob) => void;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({ accounts, onImportSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successJob, setSuccessJob] = useState<ImportJob | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const validateAndSetFile = (file: File) => {
    setErrorMsg(null);
    setSuccessJob(null);

    const validExtensions = ['.csv', '.xlsx'];
    const fileName = file.name.toLowerCase();
    const isValidExt = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValidExt) {
      setErrorMsg('Invalid file type. Please upload a valid CSV (.csv) or Excel (.xlsx) file.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('File exceeds the maximum limit of 15MB.');
      return;
    }

    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file) validateAndSetFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file) validateAndSetFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || isUploading || uploadingRef.current) return;

    uploadingRef.current = true;
    setIsUploading(true);
    setErrorMsg(null);
    setSuccessJob(null);

    try {
      const job = await financialService.uploadStatement(
        selectedFile,
        selectedAccountId || undefined,
      );
      setSuccessJob(job);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onImportSuccess(job);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to process financial import. Please verify file formatting.');
      }
    } finally {
      uploadingRef.current = false;
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Statement Ingestion</h2>
          <p className="text-xs text-slate-400">
            Import CSV or Excel bank and credit card statements. Normalized amounts are converted to
            exact minor units.
          </p>
        </div>

        {accounts.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="account-select" className="text-xs text-slate-400 whitespace-nowrap">
              Target Account:
            </label>
            <select
              id="account-select"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Primary Operating Account (Default)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Drag & Drop Card */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-emerald-500 bg-emerald-500/5'
            : 'border-slate-800 hover:border-slate-700 bg-slate-900/20'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileChange}
          className="hidden"
          data-testid="file-upload-input"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <UploadCloud className="w-6 h-6 stroke-[2]" />
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">
              {selectedFile ? selectedFile.name : 'Click to select or drag and drop a statement'}
            </p>
            <p className="text-xs text-slate-400">
              Supported formats: <span className="text-slate-300 font-mono">.CSV</span>,{' '}
              <span className="text-slate-300 font-mono">.XLSX</span> (Up to 10MB, max 10,000 rows)
            </p>
          </div>

          {selectedFile && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200">
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
            </div>
          )}
        </div>
      </div>

      {/* Upload Action Button */}
      {selectedFile && (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFile(null);
            }}
            disabled={isUploading}
            className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-800 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleUpload();
            }}
            disabled={isUploading}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-slate-950 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Ingesting Statement...</span>
              </>
            ) : (
              <span>Upload & Ingest Records</span>
            )}
          </button>
        </div>
      )}

      {/* Error Feedback */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Import Failed</p>
            <p className="text-rose-400/90 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Success Feedback */}
      {successJob && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-xs text-emerald-300 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Import Processed Successfully</p>
            <p className="text-emerald-400/90 mt-0.5">
              File <span className="font-mono text-white">{successJob.fileName}</span>: Accepted{' '}
              <strong className="text-white">{successJob.acceptedRows}</strong> rows, skipped{' '}
              <strong className="text-white">{successJob.duplicateRows}</strong> duplicates,{' '}
              <strong className="text-white">{successJob.rejectedRows}</strong> errors.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
