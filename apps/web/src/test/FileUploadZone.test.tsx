import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileUploadZone } from '../components/FileUploadZone';

describe('FileUploadZone Component', () => {
  const mockAccounts = [
    {
      id: 'acc-1',
      organizationId: 'org-1',
      name: 'Primary Checking',
      type: 'checking' as const,
      currency: 'USD',
      institutionName: 'Chase',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  it('renders upload instructions and target account selector', () => {
    render(<FileUploadZone accounts={mockAccounts} onImportSuccess={vi.fn()} />);

    expect(screen.getByText(/Statement Ingestion/i)).toBeInTheDocument();
    expect(screen.getByText(/Click to select or drag and drop a statement/i)).toBeInTheDocument();
    expect(screen.getByText(/Supported formats:/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target Account:/i)).toBeInTheDocument();
  });

  it('validates file extension and rejects unsupported formats', () => {
    render(<FileUploadZone accounts={mockAccounts} onImportSuccess={vi.fn()} />);

    const input = screen.getByTestId('file-upload-input');
    const invalidFile = new File(['dummy'], 'contract.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [invalidFile] } });

    expect(
      screen.getByText(
        /Invalid file type. Please upload a valid CSV \(\.csv\) or Excel \(\.xlsx\) file\./i,
      ),
    ).toBeInTheDocument();
  });

  it('accepts valid CSV files and displays file size indicator and upload button', () => {
    render(<FileUploadZone accounts={mockAccounts} onImportSuccess={vi.fn()} />);

    const input = screen.getByTestId('file-upload-input');
    const validFile = new File(['Date,Description,Amount\n2026-03-01,Test,100'], 'statement.csv', {
      type: 'text/csv',
    });

    fireEvent.change(input, { target: { files: [validFile] } });

    expect(screen.getByText('statement.csv')).toBeInTheDocument();
    expect(screen.getByText(/Upload & Ingest Records/i)).toBeInTheDocument();
  });

  it('rejects files exceeding the 15MB size limit', () => {
    render(<FileUploadZone accounts={mockAccounts} onImportSuccess={vi.fn()} />);

    const input = screen.getByTestId('file-upload-input');
    // Create dummy 16MB file
    const oversizedFile = new File(['x'], 'oversized.csv', { type: 'text/csv' });
    Object.defineProperty(oversizedFile, 'size', { value: 16 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [oversizedFile] } });

    expect(screen.getByText(/File exceeds the maximum limit of 15MB/i)).toBeInTheDocument();
  });
});
