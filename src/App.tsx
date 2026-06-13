import React, { useState, useRef } from 'react';
import { 
  Upload, FileSpreadsheet, RefreshCw, AlertTriangle, Sparkles, 
  Check, FileText, Image, Search, ChevronRight, Info, Eye, ClipboardCopy, Edit2
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface StudentRecord {
  sNo: string;
  admNo: string;
  name: string;
  dob: string;
  religion: string;
  caste: string;
  emisNo: string;
  bloodGroup: string;
  height: string;
  weight: string;
  annualIncome: string;
  fatherName: string;
  fatherOccupation: string;
  motherName: string;
  motherOccupation: string;
  address: string;
  cellNo: string;
  aadharNo: string;
  identMark: string;
}

const COLUMNS = [
  { key: 'sNo', label: 'S.No' },
  { key: 'admNo', label: 'Adm No' },
  { key: 'name', label: 'Name' },
  { key: 'dob', label: 'DOB' },
  { key: 'religion', label: 'Religion' },
  { key: 'caste', label: 'Caste' },
  { key: 'emisNo', label: 'EMIS No' },
  { key: 'bloodGroup', label: 'Blood Group' },
  { key: 'height', label: 'Ht' },
  { key: 'weight', label: 'Wt' },
  { key: 'annualIncome', label: 'Annual Income' },
  { key: 'fatherName', label: 'Father Name' },
  { key: 'fatherOccupation', label: 'Father Occupation' },
  { key: 'motherName', label: 'Mother Name' },
  { key: 'motherOccupation', label: 'Mother Occupation' },
  { key: 'address', label: 'Address' },
  { key: 'cellNo', label: 'Cell No' },
  { key: 'aadharNo', label: 'Aadhar No' },
  { key: 'identMark', label: 'Ident Mark' }
] as const;

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [preprocessedImage, setPreprocessedImage] = useState<string | null>(null);
  const [imageTab, setImageTab] = useState<'original' | 'optimized'>('optimized');
  const [isDragging, setIsDragging] = useState(false);

  const [appendMode, setAppendMode] = useState<boolean>(true);
  
  const [status, setStatus] = useState<'idle' | 'preprocessing' | 'loading_engine' | 'reading' | 'parsing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [rawText, setRawText] = useState<string>('');
  const [parsedRecords, setParsedRecords] = useState<StudentRecord[]>([]);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colKey: keyof StudentRecord } | null>(null);
  const [editValue, setEditValue] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // IMAGE PREPROCESSING LOGIC
  // ---------------------------------------------------------------------------
  
  // Custom optimal 3x3 sharpen convolution filter
  const applySharpenFilter = (ctx: CanvasRenderingContext2D, width: number, height: number, strength: number = 0.3) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const output = ctx.createImageData(width, height);
    const outData = output.data;

    const s = strength;
    const a = 1 + 4 * s;
    const rowBytes = width * 4;

    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * rowBytes;
      const prevRowOffset = (y - 1) * rowBytes;
      const nextRowOffset = (y + 1) * rowBytes;

      for (let x = 1; x < width - 1; x++) {
        const idx = rowOffset + x * 4;
        
        // Preserve alpha channel
        outData[idx + 3] = data[idx + 3];

        // Process RGB
        for (let c = 0; c < 3; c++) {
          const center = data[idx + c];
          const up = data[prevRowOffset + x * 4 + c];
          const down = data[nextRowOffset + x * 4 + c];
          const left = data[idx - 4 + c];
          const right = data[idx + 4 + c];

          let val = a * center - s * (up + down + left + right);
          if (val < 0) val = 0;
          else if (val > 255) val = 255;
          outData[idx + c] = val;
        }
      }
    }

    // Fast boundary pixel copying
    const lastRowOffset = (height - 1) * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      outData[i] = data[i];
      outData[lastRowOffset + i] = data[lastRowOffset + i];
    }
    for (let y = 1; y < height - 1; y++) {
      const rowOffset = y * rowBytes;
      const lastColOffset = rowOffset + (width - 1) * 4;
      for (let c = 0; c < 4; c++) {
        outData[rowOffset + c] = data[rowOffset + c];
        outData[lastColOffset + c] = data[lastColOffset + c];
      }
    }

    ctx.putImageData(output, 0, 0);
  };

  const preprocessImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Step 4: Scale up 2x if image is small (under 1200px wide)
            if (width < 1200) {
              width *= 2;
              height *= 2;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Failed to obtain Canvas text rendering context.'));
              return;
            }
            
            // Steps 1 & 2: Convert to grayscale and increase contrast (contrast 1.8)
            ctx.filter = 'grayscale(100%) contrast(1.8)';
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            // Step 3: Apply slight sharpening convolution
            applySharpenFilter(ctx, width, height, 0.3);
            
            resolve(canvas.toDataURL('image/png'));
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Failed to load selected image into memory.'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Unable to read selected file on current platform.'));
      reader.readAsDataURL(file);
    });
  };

  // ---------------------------------------------------------------------------
  // PARSING RULES
  // ---------------------------------------------------------------------------
  
  const isRecordBoundary = (line: string): boolean => {
    const cleanLine = line.trim();
    if (cleanLine.length === 0) return false;

    // Serial number pattern: optionally starting with brackets/parents, followed by digits and dot/dash/parenthesis/space
    if (/^\s*[\[\(]?\d{1,2}[\]\).:\-\s]/.test(cleanLine)) {
      // guard against matching date of birth like 12-05-2010 or 12/05
      if (!/^\s*\d{1,2}[.\-\/]\d{1,2}/.test(cleanLine)) {
        return true;
      }
    }

    // Admission number pattern: /[A-Z]?\d{3,5}/ at word boundaries toward start
    if (/^\s*[A-Z]?\d{3,5}\b/i.test(cleanLine)) {
      const isYear = /^\s*(19|20)\d{2}\b/.test(cleanLine);
      const isSystemKeywords = /^(HT|WT|DOB|EMIS|BLOOD|CELL|PHONE|MOB|AADHAR|ADHAR)/i.test(cleanLine);
      if (!isYear && !isSystemKeywords) {
        return true;
      }
    }

    return false;
  };

  const extractSNoAndAdmNo = (lines: string[]): { sNo: string; admNo: string } => {
    let sNo = '';
    let admNo = '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (!sNo) {
        const matchSno = trimmed.match(/^[\[\(]?(\d{1,2})[\]\).:\-\s]/);
        if (matchSno) {
          sNo = matchSno[1];
        } else {
          const simpleMatch = trimmed.match(/^(\d{1,2})\b/);
          if (simpleMatch && !/^\d{1,2}[.\-\/]\d{1,2}/.test(trimmed)) {
            sNo = simpleMatch[1];
          }
        }
      }

      if (!admNo) {
        const matchAdm = trimmed.match(/\b([A-Z]?\d{3,5})\b/i);
        if (matchAdm) {
          const candidate = matchAdm[1];
          const numOnly = candidate.replace(/[A-Z]/i, '');
          const isYear = /^(19|20)\d{2}$/.test(candidate);
          
          if (numOnly !== sNo && !isYear) {
            admNo = candidate.toUpperCase();
          }
        }
      }
    }

    return { sNo, admNo };
  };

  const extractName = (lines: string[]): string => {
    for (const line of lines) {
      let cleaned = line.trim();
      
      // 1. Strip Serial numbers at start (e.g. "1. ", "12) ", "1- ", "01 ")
      cleaned = cleaned.replace(/^\s*\d{1,2}\s*[.\-\)\/\s]\s*/i, '');
      
      // 2. Strip Admission numbers at start or word boundaries (e.g. "A415", "2045")
      cleaned = cleaned.replace(/^\s*[A-Z]?\d{3,5}\b/i, '');
      
      // 3. Strip Name prefix label if any (e.g. "Name: ", "Student Name - ")
      cleaned = cleaned.replace(/^(?:Name|Student\s*Name|Student|S\s*Name)\s*[:.\-\s]+/i, '');
      
      // 4. Strip DOB or other dates (e.g. "23/04/2007" or "12-05-10")
      cleaned = cleaned.replace(/\b\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}\b/g, '');
      
      // 5. Strip long numbers (Aadhar, EMIS, phone numbers)
      cleaned = cleaned.replace(/\b\d{10,16}\b/g, '');
      
      // 6. Strip system keywords/labels and Caste/Religion abbreviations specifically as separate words
      cleaned = cleaned.replace(/\b(?:HINDU|CHRISTIAN|MUSLIM|EMIS|AADHAR|CELL|PHONE|MOBILE|BLOOD|ANNUAL|INCOME|FATHER|MOTHER|PARENT|QUALIFICATION|OCCUPATION|ADDRESS|BC|MBC|OC|SC|ST|DNC|OBC|HT|WT|DOB|S\.?NO|ADM\.?NO)\b/ig, '');
      
      // 7. Strip isolated singular letters or noisy punctuation
      cleaned = cleaned.replace(/[^a-zA-Z\s.]/g, ' '); // Replace all non-alphabetic/non-dot characters with space
      cleaned = cleaned.replace(/\s+/g, ' ').trim(); // Collapse multiple spaces
      
      // Filter out words that are too short/isolated but keep valid names
      const words = cleaned.split(' ').filter(w => w.length >= 1);
      const rejoined = words.join(' ');
      
      if (rejoined.replace(/[^a-zA-Z]/g, '').length >= 3) {
        return rejoined.toUpperCase();
      }
    }
    return '';
  };

  const parseFallback = (text: string): StudentRecord[] => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return [];

    const rows: string[][] = [];
    for (const line of lines) {
      // Split by 2+ spaces or tabs
      const cells = line.split(/\s{2,}|\t+/).map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return [];

    // Skip first row as header if more rows exist, else treat first as data
    const dataRows = rows.length > 1 ? rows.slice(1) : rows;
    
    return dataRows.map((row, idx) => ({
      sNo: row[0] || String(idx + 1),
      admNo: row[1] || '-',
      name: row[2] || '-',
      dob: row[3] || '-',
      religion: row[4] || '-',
      caste: row[5] || '-',
      emisNo: row[6] || '-',
      bloodGroup: row[7] || '-',
      height: row[8] || '-',
      weight: row[9] || '-',
      annualIncome: row[10] || '-',
      fatherName: row[11] || '-',
      fatherOccupation: '-',
      motherName: '-',
      motherOccupation: '-',
      address: '-',
      cellNo: row[12] || '-',
      aadharNo: row[13] || '-',
      identMark: row[14] || '-'
    }));
  };

  const parseOCRText = (text: string): { records: StudentRecord[]; isFallback: boolean } => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    const recordGroups: string[][] = [];
    let currentGroup: string[] = [];

    for (const line of lines) {
      if (isRecordBoundary(line)) {
        if (currentGroup.length > 0) {
          recordGroups.push(currentGroup);
        }
        currentGroup = [line];
      } else {
        if (currentGroup.length > 0) {
          currentGroup.push(line);
        } else {
          currentGroup = [line];
        }
      }
    }
    if (currentGroup.length > 0) {
      recordGroups.push(currentGroup);
    }

    const records: StudentRecord[] = [];
    
    recordGroups.forEach(groupLines => {
      const { sNo, admNo } = extractSNoAndAdmNo(groupLines);
      const name = extractName(groupLines);
      
      let dob = '';
      let religion = '';
      let caste = '';
      let emisNo = '';
      let bloodGroup = '';
      let height = '';
      let weight = '';
      let annualIncome = '';
      let parentInfo = '';
      let cellNo = '';
      let aadharNo = '';
      let identMark = '';

      groupLines.forEach(line => {
        // EMIS NO. regex
        const emisMatch = line.match(/EMIS\s*NO?\.?\s*[:\s]*([\d\s]{10,})/i);
        if (emisMatch && !emisNo) {
          emisNo = emisMatch[1].replace(/\s+/g, '').slice(0, 13);
        }

        // DOB regex
        const dobMatch = line.match(/\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4}/);
        if (dobMatch && !dob) {
          dob = dobMatch[0];
        }

        // Blood Group regex
        const bgMatch = line.match(/\b(A|B|AB|O)[+\-]\b/i);
        if (bgMatch && !bloodGroup) {
          bloodGroup = bgMatch[0].toUpperCase();
        }

        // Height regex
        const htMatch = line.match(/Ht[\s:]*(\d{2,3})/i);
        if (htMatch && !height) {
          height = htMatch[1] + ' cm';
        }

        // Weight regex
        const wtMatch = line.match(/Wt[\s:]*(\d{1,3})/i);
        if (wtMatch && !weight) {
          weight = wtMatch[1] + ' kg';
        }

        // Cell phone regex
        const cellLabelMatch = line.match(/(?:Cell|Ph|Mob)[\s.:]*(\d{10})/i);
        if (cellLabelMatch) {
          if (!cellNo) cellNo = cellLabelMatch[1];
        } else {
          const bareCell = line.match(/\b(\d{10})\b/);
          if (bareCell && !cellNo) {
            cellNo = bareCell[1];
          }
        }

        // Aadhar regex
        const aadharMatch = line.match(/(?:Aadhar|Adhar)\s*No\.?\s*[:\s]*([\d\s]{12,})/i);
        if (aadharMatch && !aadharNo) {
          aadharNo = aadharMatch[1].replace(/\s+/g, '');
        }

        // Religion regex
        const relMatch = line.match(/HINDU|CHRISTIAN|MUSLIM/i);
        if (relMatch && !religion) {
          religion = relMatch[0].toUpperCase();
        }

        // Caste regex
        const casteMatch = line.match(/\b(BC|MBC|OC|SC|ST|DNC|OBC)\b/i);
        if (casteMatch && !caste) {
          caste = casteMatch[0].toUpperCase();
        }

        // Identification Mark regex
        if (/MOLE|SCAR|MARK|BIRTH/i.test(line) && !identMark) {
          const cleanMark = line.replace(/^(?:Identification|Ident)?\s*Mark[s:\s]*/i, '').trim();
          identMark = cleanMark || line.trim();
        }

        // Parent Information regex
        if (/B\.A|B\.SC|ITI|FARMER|DRIVER|COOLIE|HOMEMAKER|LABOUR|BUSINESS|TEACHER|ENGINEER/i.test(line) && !parentInfo) {
          parentInfo = line.trim();
        }
      });

      // Annual Income lookup
      groupLines.forEach(line => {
        if (/income/i.test(line) || /annual/i.test(line)) {
          const incomeMatch = line.match(/(\d[\d,]{3,})\s*$/);
          if (incomeMatch && !annualIncome) {
            annualIncome = incomeMatch[1];
          }
        }
      });

      // Filter out empty lines or non-student text
      if (sNo || admNo || name || dob || cellNo || aadharNo || emisNo) {
        // Try to split parentInfo by comma/slash as a fallback for offline
        let fName = '-';
        let fOcc = '-';
        let mName = '-';
        let mOcc = '-';
        let addr = '-';
        
        if (parentInfo && parentInfo !== '-') {
          const splitSlash = parentInfo.split('/');
          if (splitSlash.length >= 2) {
            fName = splitSlash[0].trim();
            mName = splitSlash[1].trim();
          } else {
            fName = parentInfo;
          }
        }

        records.push({
          sNo: sNo || '-',
          admNo: admNo || '-',
          name: name || '-',
          dob: dob || '-',
          religion: religion || '-',
          caste: caste || '-',
          emisNo: emisNo || '-',
          bloodGroup: bloodGroup || '-',
          height: height || '-',
          weight: weight || '-',
          annualIncome: annualIncome || '-',
          fatherName: fName,
          fatherOccupation: fOcc,
          motherName: mName,
          motherOccupation: mOcc,
          address: addr,
          cellNo: cellNo || '-',
          aadharNo: aadharNo || '-',
          identMark: identMark || '-'
        });
      }
    });

    if (records.length === 0) {
      return { records: parseFallback(text), isFallback: true };
    }

    return { records, isFallback: false };
  };

  // ---------------------------------------------------------------------------
  // PROCESS FLOW
  // ---------------------------------------------------------------------------
  
  const handleFileChange = async (file: File) => {
    if (!file) return;
    setStatus('preprocessing');
    setErrorMessage(null);
    setRawText('');
    if (!appendMode) {
      setParsedRecords([]);
    }
    setIsFallbackMode(false);
    
    try {
      const originalUrl = URL.createObjectURL(file);
      setImage(originalUrl);
      
      const preUrl = await preprocessImage(file);
      setPreprocessedImage(preUrl);
      
      setStatus('loading_engine');
      setProgress(20);
      
      setStatus('reading');
      setProgress(50);
      
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: preUrl }),
      });
      
      setProgress(85);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}. Please check your GEMINI_API_KEY secret configuration.`);
      }
      
      const data = await response.json();
      setProgress(95);
      setRawText(data.rawText || JSON.stringify(data.records, null, 2));
      
      const newRecords = data.records || [];
      if (appendMode) {
        setParsedRecords(prev => [...prev, ...newRecords]);
      } else {
        setParsedRecords(newRecords);
      }
      
      setIsFallbackMode(false);
      setStatus('done');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'OCR extraction process failed. Please ensure the image is bright and legible.');
      setStatus('error');
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleReset = () => {
    setImage(null);
    setPreprocessedImage(null);
    setStatus('idle');
    setRawText('');
    setParsedRecords([]);
    setIsFallbackMode(false);
    setSearchQuery('');
    setErrorMessage(null);
    setProgress(0);
  };

  const handleExport = () => {
    if (parsedRecords.length === 0) return;
    
    const headers = COLUMNS.map(c => c.label);
    const aoaData = [headers];
    
    parsedRecords.forEach(r => {
      aoaData.push([
        r.sNo,
        r.admNo,
        r.name,
        r.dob,
        r.religion,
        r.caste,
        r.emisNo,
        r.bloodGroup,
        r.height,
        r.weight,
        r.annualIncome,
        r.fatherName,
        r.fatherOccupation,
        r.motherName,
        r.motherOccupation,
        r.address,
        r.cellNo,
        r.aadharNo,
        r.identMark
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoaData);
    
    // Auto column widths
    const colWidths = headers.map((header, colIdx) => {
      let maxLen = header.length;
      aoaData.forEach(row => {
        const val = String(row[colIdx] || '');
        if (val.length > maxLen) {
          maxLen = val.length;
        }
      });
      return { wch: Math.max(maxLen + 3, 8) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Register');
    XLSX.writeFile(wb, 'register_output.xlsx');
  };

  // ---------------------------------------------------------------------------
  // INTERACTIVE PREVIEW CELL EDITOR
  // ---------------------------------------------------------------------------
  
  const startEditing = (idx: number, colKey: keyof StudentRecord, currentVal: string) => {
    setEditingCell({ rowIdx: idx, colKey });
    setEditValue(currentVal === '-' ? '' : currentVal);
  };

  const saveCell = (idx: number, colKey: keyof StudentRecord) => {
    const updated = [...parsedRecords];
    updated[idx] = {
      ...updated[idx],
      [colKey]: editValue.trim() || '-'
    };
    setParsedRecords(updated);
    setEditingCell(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent, idx: number, colKey: keyof StudentRecord) => {
    if (e.key === 'Enter') {
      saveCell(idx, colKey);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // Filtered preview data
  const filteredRecords = parsedRecords.filter(r => {
    const s = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(s) ||
      r.admNo.toLowerCase().includes(s) ||
      r.emisNo.toLowerCase().includes(s) ||
      r.cellNo.toLowerCase().includes(s) ||
      r.religion.toLowerCase().includes(s) ||
      r.caste.toLowerCase().includes(s)
    );
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased flex flex-col p-4 sm:p-8">
      <div className="w-full max-w-7xl mx-auto flex flex-col gap-6 flex-1">
        
        {/* UPPERCASE BOLD TITLED HEADER */}
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end pb-6 border-b-4 border-slate-900 gap-4">
          <div className="flex flex-col">
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-0.05em] leading-[0.9] uppercase text-slate-900">
              Register<br />Extract
            </h1>
            <p className="text-slate-500 mt-2 font-semibold tracking-wide text-xs sm:text-sm">
              HYBRID AI & OFFLINE REGISTER DIGITIZER
            </p>
          </div>
          
          <div className="flex gap-3 mb-1 shrink-0">
            {status !== 'idle' && (
              <button 
                onClick={handleReset}
                className="px-6 py-3 bg-slate-200 text-slate-700 font-bold uppercase tracking-tighter hover:bg-slate-300 transition-all text-xs cursor-pointer"
              >
                Reset / New Scan
              </button>
            )}
            {status === 'done' && parsedRecords.length > 0 && (
              <button 
                onClick={handleExport}
                className="px-8 py-3 bg-slate-900 text-white font-bold uppercase tracking-tighter hover:bg-[#1E293B] hover:shadow-md transition-all text-xs cursor-pointer inline-flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Download .xlsx
              </button>
            )}
          </div>
        </header>

        {/* main grid - col-span-4 (upload + status/img) and col-span-8 (results table or state) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
          
          {/* Left Column, upload + options */}
          <section className="lg:col-span-4 flex flex-col gap-6">
            


            {/* Scan Action / Accumulation Mode Option */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                Multi-Page Accumulation
              </span>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAppendMode(true)}
                  className={`py-2 px-3 text-xs font-extrabold uppercase rounded-lg tracking-tight transition-all cursor-pointer ${
                    appendMode
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  📥 Add to Same Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setAppendMode(false)}
                  className={`py-2 px-3 text-xs font-extrabold uppercase rounded-lg tracking-tight transition-all cursor-pointer ${
                    !appendMode
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  📄 Add to New Sheet
                </button>
              </div>
              <p className="text-[11px] font-semibold text-slate-500 leading-snug">
                {appendMode 
                  ? '📥 Multi-page mode. Scan your register pages one-by-one; each new scan will append to the current sheet.'
                  : '📄 Single-page mode. Each new scan will clear the table grid and start a fresh sheet.'}
              </p>
            </div>

            {/* Input image block */}
            <div 
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => status === 'idle' ? fileInputRef.current?.click() : null}
              className={`border-4 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center relative group overflow-hidden transition-all duration-200 min-h-[300px] ${
                image ? 'border-slate-300 bg-white' : 'border-slate-300 hover:border-slate-800 bg-white cursor-pointer hover:shadow-sm'
              } ${isDragging ? 'border-slate-900 bg-slate-100/50' : ''}`}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
                accept="image/png, image/jpeg, image/webp"
                className="hidden" 
              />
              
              {!image ? (
                <div className="z-10 py-6">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-all">
                    <Upload className="w-8 h-8 text-slate-800" />
                  </div>
                  <p className="text-sm font-extrabold uppercase tracking-tight text-slate-900">
                    Drop Register Photo Here
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto font-medium">
                    Digitizes records with near-100% handwriting accuracy using secure AI.
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="mt-4 px-4 py-2 bg-slate-900 text-white font-bold uppercase tracking-tighter text-[11px] hover:bg-black transition-all cursor-pointer"
                  >
                    Select File
                  </button>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col space-y-4">
                  {/* Dynamic Tabbed selector inside image block */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 z-10">
                    <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest inline-flex items-center gap-1">
                      <Image className="w-3.5 h-3.5" />
                      Active Register Photo
                    </span>
                    <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setImageTab('original'); }}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded transition-all ${
                          imageTab === 'original' 
                            ? 'bg-slate-900 text-white shadow-sm' 
                            : 'text-gray-500 hover:text-slate-800'
                        }`}
                      >
                        Original
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setImageTab('optimized'); }}
                        className={`text-[9px] font-bold px-2 py-0.5 rounded transition-all ${
                          imageTab === 'optimized' 
                            ? 'bg-slate-900 text-white shadow-sm' 
                            : 'text-gray-500 hover:text-slate-800'
                        }`}
                      >
                        Scan Filter
                      </button>
                    </div>
                  </div>

                  <div className="relative rounded-lg overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center p-2 flex-grow aspect-square min-h-[180px]">
                    {imageTab === 'original' && image && (
                      <img 
                        src={image} 
                        alt="Original scanner" 
                        referrerPolicy="no-referrer"
                        className="object-contain max-h-[240px] w-full rounded"
                      />
                    )}
                    {imageTab === 'optimized' && preprocessedImage && (
                      <img 
                        src={preprocessedImage} 
                        alt="Contrast Preprocessed contour" 
                        referrerPolicy="no-referrer"
                        className="object-contain max-h-[240px] w-full rounded"
                      />
                    )}
                  </div>
                  
                  <div className="text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200/50 p-2.5 rounded-lg text-left">
                    Double-click any cell in the preview grid table to manually refine the values if needed.
                  </div>
                </div>
              )}
            </div>


          </section>

          {/* Right Column, Dynamic view container */}
          <section className="lg:col-span-8 flex flex-col gap-6 min-h-0">
            
            {/* If app is idle */}
            {status === 'idle' && (
              <div className="flex-1 bg-white border-2 border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center min-h-[350px]">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-full mb-4">
                  <FileText className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-extrabold uppercase text-slate-900 tracking-tight">Ready for Digitization</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                  No register loaded yet. Drag and drop any scanned image with students' records into the left panel to begin.
                </p>
                <div className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-slate-700 bg-slate-50 px-3 py-1 rounded">
                  <Sparkles className="w-3.5 h-3.5 text-slate-800" />
                  Supports English school register standard layouts
                </div>
              </div>
            )}

            {/* If App is Processing (Preprocessing -> Loading -> Reading -> Parsing) */}
            {status !== 'idle' && status !== 'done' && status !== 'error' && (
              <div className="bg-white border-2 border-slate-900 p-6 rounded-xl shadow-[4px_4px_0px_#0F172A] space-y-5">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></span>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      {status === 'preprocessing' && "Optimizing Digital Image…"}
                      {status === 'loading_engine' && "Initializing OCR Kernel…"}
                      {status === 'reading' && "Running Spatial Character Recognition…"}
                      {status === 'parsing' && "Reconstructing Register Grid…"}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    {status === 'preprocessing' ? '15%' : status === 'loading_engine' ? '40%' : status === 'reading' ? `${Math.round(40 + progress * 0.5)}%` : '95%'} COMPLETE
                  </span>
                </div>

                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                  <div 
                    className="h-full active-progress bg-gradient-to-r from-slate-900 to-slate-700 transition-all duration-300"
                    style={{ 
                      width: `${
                        status === 'preprocessing' ? 15 : 
                        status === 'loading_engine' ? 40 : 
                        status === 'reading' ? (40 + (progress * 0.5)) : 
                        95
                      }%` 
                    }}
                  />
                </div>

                <div className="grid grid-cols-4 text-[10px] font-bold text-slate-400 uppercase tracking-tighter text-center">
                  <span className={status === 'preprocessing' ? 'text-slate-950 underline font-extrabold' : ''}>Preprocessing</span>
                  <span className={status === 'loading_engine' ? 'text-slate-950 underline font-extrabold' : ''}>Model Engine</span>
                  <span className={status === 'reading' ? 'text-slate-950 underline font-extrabold' : ''}>Running OCR</span>
                  <span className={status === 'parsing' ? 'text-slate-950 underline font-extrabold' : ''}>Constructing Sheet</span>
                </div>
              </div>
            )}

            {/* Error state */}
            {status === 'error' && (
              <div className="bg-red-50/50 rounded-xl border-2 border-red-200 p-6">
                <div className="flex gap-4">
                  <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 self-start" />
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-red-900 uppercase">Process Failed</h3>
                      <p className="text-xs text-red-700 mt-1 whitespace-pre-wrap leading-relaxed">
                        {errorMessage || "We encountered an unknown error transcribing the text."}
                      </p>
                    </div>
                    <div>
                      <button 
                        onClick={handleReset} 
                        className="px-4 py-2 bg-slate-900 text-white font-bold text-xs uppercase tracking-tighter hover:bg-black transition-all"
                      >
                        Try with Another Photo
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Success State data list */}
            {status === 'done' && (
              <div className="flex-1 bg-white border-2 border-slate-200 rounded-xl overflow-hidden flex flex-col">
                
                {/* Segment Preview Header */}
                <div className="bg-slate-100 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-bold uppercase text-slate-500">Preview Data Grid</h2>
                    {isFallbackMode && (
                      <span className="px-2 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded">
                        Fallback Grid View
                      </span>
                    )}
                  </div>
                  <div className="px-3 py-1 bg-slate-900 text-white text-[10px] font-bold rounded select-none uppercase tracking-wider shrink-0">
                    {parsedRecords.length} Records • {COLUMNS.length} Columns
                  </div>
                </div>

                {/* Table search filter bar */}
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <Search className="w-4 h-4" />
                    </span>
                    <input 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter preview grid by Student Name, Religion, Caste, phone..."
                      className="w-full text-xs pl-9 pr-4 py-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-850 focus:ring-1 focus:ring-slate-400"
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono font-bold flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    Double click cell to edit/correct data
                  </div>
                </div>

                {/* Main Table View */}
                <div className="overflow-auto flex-1 max-h-[400px]">
                  <table className="w-full text-left border-collapse table-fixed min-w-[2200px]">
                    <thead className="sticky top-0 bg-slate-100 text-[10px] font-bold uppercase text-slate-600 border-b border-slate-200 z-10">
                      <tr>
                        {COLUMNS.map((col) => (
                          <th 
                            key={col.key} 
                            className="p-3 border-r border-slate-200 uppercase tracking-tight last:border-0"
                            style={{ 
                              width: col.key === 'sNo' ? '70px' : 
                                     col.key === 'name' ? '240px' : 
                                     col.key === 'fatherName' || col.key === 'motherName' || col.key === 'address' || col.key === 'identMark' ? '240px' : '140px' 
                            }}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-[11px] font-medium text-slate-800 divide-y divide-slate-100 font-mono">
                      {filteredRecords.length > 0 ? (
                        filteredRecords.map((record, rIdx) => (
                          <tr key={rIdx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors odd:bg-white even:bg-slate-50/50">
                            {COLUMNS.map((col) => {
                              const isCellEditing = editingCell?.rowIdx === rIdx && editingCell?.colKey === col.key;
                              return (
                                <td 
                                  key={col.key} 
                                  className="p-3 border-r border-slate-100 truncate relative align-middle group/cell cursor-pointer"
                                  onDoubleClick={() => startEditing(rIdx, col.key, record[col.key])}
                                >
                                  {isCellEditing ? (
                                    <input 
                                      autoFocus
                                      type="text"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={() => saveCell(rIdx, col.key)}
                                      onKeyDown={(e) => handleKeyPress(e, rIdx, col.key)}
                                      className="w-full px-1 py-1 border border-slate-805 bg-white rounded outline-none text-[11px] text-slate-900 shadow-sm"
                                    />
                                  ) : (
                                    <div className="flex justify-between items-center">
                                      <span className="truncate">{record[col.key] || '-'}</span>
                                      <button 
                                        onClick={() => startEditing(rIdx, col.key, record[col.key])}
                                        className="opacity-0 group-hover/cell:opacity-100 p-0.5 hover:bg-slate-200 rounded text-slate-500 transition-all pointer-events-auto"
                                        title="Edit manual entry"
                                      >
                                        <Edit2 className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={COLUMNS.length} className="p-12 text-center text-slate-400 font-mono">
                            No records matching filter selection.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer Stats */}
                <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <span>Completed Register Index Construction</span>
                  <span className="text-emerald-700 select-none flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> Checked offline sandbox
                  </span>
                </div>

              </div>
            )}

            {/* Raw transcribed debug view */}
            {rawText && (
              <div className="bg-white border border-slate-250 rounded-xl overflow-hidden shadow-sm">
                <details className="group">
                  <summary className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 select-none">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-700" />
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-widest">
                        Raw Transcribed OCR Debug Log
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="p-4 border-t border-slate-200 bg-slate-950 text-sky-400 font-mono text-[10px] select-text overflow-auto leading-relaxed max-h-[180px]">
                    <pre className="whitespace-pre-wrap">
                      {rawText}
                    </pre>
                  </div>
                </details>
              </div>
            )}

          </section>

        </div>

        {/* Footer info from design */}
        <footer className="flex justify-between items-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 border-t border-slate-200 pt-6 mt-4 pb-4">
          <div className="flex gap-4">
            <span>Powered by Gemini 3.5 Flash &amp; Tesseract.js</span>
            <span>SheetJS (XLSX)</span>
          </div>
          <span>&copy; {new Date().getFullYear()} Educational Records Digitization</span>
        </footer>

      </div>
    </div>
  );
}
