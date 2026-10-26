import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { financialService } from '../services/financial.service';
import type { FinancialAccount, ImportJob } from '@moneylens/shared';
import { ApiClientError } from '../lib/api-client';

interface FileUploadZoneProps {
  accounts: FinancialAccount[];
  onImportSuccess: (job: ImportJob) => void;
  defaultAccountId?: string;
  onViewExistingJob?: (jobId: string) => void;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  accounts,
  onImportSuccess,
  defaultAccountId,
  onViewExistingJob,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(defaultAccountId || '');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    message: string;
    existingJobId?: string;
  } | null>(null);
  const [successJob, setSuccessJob] = useState<ImportJob | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

  React.useEffect(() => {
    if (defaultAccountId !== undefined) {
      setSelectedAccountId(defaultAccountId);
    }
  }, [defaultAccountId]);

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
    setDuplicateInfo(null);
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
    setDuplicateInfo(null);
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
        if (err.code === 'DUPLICATE_IMPORT_FILE' || err.status === 409) {
          const details = err.details as { existingJobId?: string } | undefined;
          setDuplicateInfo({
            message: err.message,
            existingJobId: details?.existingJobId,
          });
          setErrorMsg(null);
        } else {
          setErrorMsg(err.message);
          setDuplicateInfo(null);
        }
      } else {
        setErrorMsg('Failed to process financial import. Please verify file formatting.');
        setDuplicateInfo(null);
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
          <h2 className="text-lg font-bold text-[#171714] dark:text-white tracking-tight">
            Statement Ingestion
          </h2>
          <p className="text-xs text-[#66645C] dark:text-slate-400">
            Import CSV or Excel bank and credit card statements. Normalized amounts are converted to
            exact minor units.
          </p>
        </div>

        {accounts.length > 0 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="account-select"
              className="text-xs text-[#66645C] dark:text-slate-400 whitespace-nowrap"
            >
              Target Account:
            </label>
            <select
              id="account-select"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-[#E8E7E2] dark:border-slate-800 text-xs text-[#171714] dark:text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
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
            ? 'border-[#E5BB45] bg-[#E5BB45]/10'
            : 'border-[#E8E7E2] dark:border-slate-800 hover:border-stone-400 bg-[#F8F7F2]/60 hover:bg-[#F8F7F2] dark:bg-slate-900/20'
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
          <div className="w-12 h-12 rounded-2xl bg-[#E5BB45]/15 border border-[#E5BB45]/30 flex items-center justify-center text-[#171714]">
            <UploadCloud className="w-6 h-6 stroke-[2]" />
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#171714] dark:text-white">
              {selectedFile ? selectedFile.name : 'Drag and drop your statement file here'}
            </p>
            <p className="text-xs text-[#66645C] dark:text-slate-400">
              Supported formats:{' '}
              <span className="text-[#171714] dark:text-slate-300 font-mono font-medium">.CSV</span>
              ,{' '}
              <span className="text-[#171714] dark:text-slate-300 font-mono font-medium">
                .XLSX
              </span>{' '}
              (Up to 15MB, max 10,000 rows)
            </p>
          </div>

          {!selectedFile ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="mt-1 min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white dark:bg-slate-800 border border-[#E8E7E2] dark:border-slate-700 hover:border-[#171714] text-xs font-semibold text-[#171714] dark:text-white shadow-2xs hover:shadow-xs transition"
            >
              <UploadCloud className="w-4 h-4 text-[#E5BB45]" />
              <span>Browse Statement File</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-[#E8E7E2] dark:border-slate-700 text-xs text-[#171714] dark:text-slate-200">
              <FileText className="w-3.5 h-3.5 text-[#E5BB45]" />
              <span className="font-medium truncate max-w-[200px]">{selectedFile.name}</span>
              <span className="text-[#66645C] dark:text-slate-400">
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Upload Action Button */}
      {selectedFile && (
        <div className="flex flex-col sm:flex-row justify-end gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedFile(null);
            }}
            disabled={isUploading}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-[#E8E7E2] dark:border-slate-800 text-xs font-semibold text-[#171714] dark:text-slate-300 hover:bg-[#F8F7F2] transition cursor-pointer"
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
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-[#E5BB45] hover:bg-[#D3A82F] text-xs font-semibold text-[#171714] transition active:scale-95 cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Ingesting Statement...</span>
              </>
            ) : (
              <span>Upload &amp; Ingest Records</span>
            )}
          </button>
        </div>
      )}

      {/* Duplicate File Feedback */}
      {duplicateInfo && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <p className="font-semibold text-amber-950">Duplicate Statement File Detected</p>
            <p className="text-amber-800 leading-relaxed">{duplicateInfo.message}</p>
            {duplicateInfo.existingJobId && onViewExistingJob && (
              <div>
                <button
                  type="button"
                  onClick={() => onViewExistingJob(duplicateInfo.existingJobId!)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-200/80 hover:bg-amber-200 text-amber-950 font-semibold transition cursor-pointer"
                >
                  <span>Inspect Existing Job ({duplicateInfo.existingJobId.slice(0, 8)}...)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Feedback */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Import Failed</p>
            <p className="text-rose-700 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Success Feedback */}
      {successJob && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Import Processed Successfully</p>
            <p className="text-emerald-700 mt-0.5">
              File{' '}
              <span className="font-mono font-medium text-[#171714]">{successJob.fileName}</span>:
              Accepted <strong className="text-[#171714]">{successJob.acceptedRows}</strong> rows,
              skipped <strong className="text-[#171714]">{successJob.duplicateRows}</strong>{' '}
              duplicates, <strong className="text-[#171714]">{successJob.rejectedRows}</strong>{' '}
              errors.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
