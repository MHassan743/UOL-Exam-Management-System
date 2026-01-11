// ===== GLOBAL VARIABLES =====
let allRows = [];
let header = [];
let currentLang = "EN";
let currentTheme = "light";
let currentProgram = "ALL";
let programData = {};
let currentPage = 1;
let rowsPerPage = 50;
let filteredRows = [];
let semesterGroups = {};
let stats = {
  totalExams: 0,
  totalStudents: 0,
  totalRooms: 0,
  activeFaculty: 0
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
  console.log('Initializing application...');
  
  // Initialize theme
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
  
  // Initialize drag and drop
  initializeDragAndDrop();
  
  // Add event listeners
  const uploadInput = document.getElementById('upload');
  if (uploadInput) {
    uploadInput.addEventListener('change', handleFile);
    console.log('File input listener added');
  } else {
    console.error('Upload input not found!');
  }
  
  // Set current date
  const now = new Date();
  document.getElementById('currentDate').textContent = formatDateDisplay(now);
  document.getElementById('scheduleDate').textContent = formatDateDisplay(now);
  
  // Initialize UI
  showLoading(false);
  showEmptyState(true);
  updateStatsUI();
  
  console.log('Application initialized successfully');
});

// ===== FILE HANDLING =====
function handleFile(e) {
  console.log('File selected:', e.target.files[0]);
  
  const file = e.target.files[0];
  if (!file) {
    showToast('Please select a file first', 'warning');
    return;
  }
  
  // Validate file type
  if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
    showToast('Please select an Excel file (.xlsx, .xls, .csv)', 'error');
    return;
  }
  
  showLoading(true);
  showEmptyState(false);
  
  const reader = new FileReader();
  
  reader.onload = function(evt) {
    console.log('File read successfully');
    try {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      
      console.log('Processing sheet:', sheetName);
      
      // Get all rows including empty ones
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      
      if (rows.length < 2) {
        showToast('Excel file is empty or has no data', 'warning');
        showLoading(false);
        showEmptyState(true);
        return;
      }
      
      // Extract header and data
      header = rows[0];
      console.log('Header:', header);
      
      // Filter only CS department rows and remove completely empty rows
      let dataRows = rows.slice(1)
        .filter(r => r && r.length > 0 && r[3] === "CS")
        .map(row => {
          // Ensure all rows have same length as header
          while (row.length < header.length) {
            row.push("");
          }
          return row;
        });
      
      console.log('CS data rows found:', dataRows.length);
      
      if (dataRows.length === 0) {
        showToast('No CS department data found in the file', 'warning');
        showLoading(false);
        showEmptyState(true);
        return;
      }
      
      // Process the data
      processData(dataRows);
      
      // Update UI
      renderTable([header, ...filteredRows]);
      updateProgramList();
      calculateStatistics();
      updateStatsUI();
      updateSelectedProgramInfo('ALL');
      
      // Show success
      showToast(`Schedule loaded successfully! ${dataRows.length} exams found.`, 'success');
      
    } catch (error) {
      console.error('Error processing file:', error);
      showToast('Error loading file: ' + error.message, 'error');
      showEmptyState(true);
    } finally {
      showLoading(false);
    }
  };
  
  reader.onerror = function() {
    console.error('Error reading file');
    showToast('Error reading file. Please try again.', 'error');
    showLoading(false);
    showEmptyState(true);
  };
  
  reader.readAsArrayBuffer(file);
}

function processData(dataRows) {
  console.log('Processing data rows:', dataRows.length);
  
  // Fix date formatting and store original data
  const processedRows = dataRows.map(row => {
    const newRow = [...row];
    
    // Fix date formatting (Excel serial number or date string)
    if (newRow[0]) {
      try {
        // Check if it's an Excel serial number (like 46036)
        if (typeof newRow[0] === 'number' && newRow[0] > 25569) {
          // Excel serial number to JavaScript Date
          const excelDate = newRow[0];
          const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
          newRow[0] = formatExcelDate(date);
        } else if (typeof newRow[0] === 'string') {
          // Try parsing date string
          const date = new Date(newRow[0]);
          if (!isNaN(date.getTime())) {
            newRow[0] = formatExcelDate(date);
          }
        } else if (newRow[0] instanceof Date) {
          // Already a Date object
          newRow[0] = formatExcelDate(newRow[0]);
        }
      } catch (e) {
        console.error('Error parsing date:', e);
        newRow[0] = 'Invalid Date';
      }
    }
    
    return newRow;
  });

  console.log('Dates processed');
  
  // Original logic for SE-7 insertion
  const se7 = processedRows.filter(r => r[2] && r[2].toString().includes("SE-7"));
  let remaining = processedRows.filter(r => !se7.includes(r));
  let lastCS6 = remaining.findLastIndex(r => r[2] && r[2].toString().includes("CS-6"));
  if (lastCS6 !== -1) remaining.splice(lastCS6 + 1, 0, ...se7);

  allRows = [header, ...remaining];
  filteredRows = remaining;
  
  // Extract semester sections
  extractSemesterSections(remaining);
  
  console.log('Data processing complete');
  console.log('Total rows:', allRows.length);
  console.log('Semester groups:', Object.keys(semesterGroups).length);
}

// Excel date format helper
function formatExcelDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}-${month}-${year}`;
}

// Display date formatting
function formatDateDisplay(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}-${month}-${year}`;
}

function extractSemesterSections(rows) {
  console.log('Extracting semester sections...');
  semesterGroups = {};
  programData = {};
  
  // Reset program data
  programData['ALL'] = rows;
  
  rows.forEach(row => {
    const prog = row[2] || "";
    
    if (!prog) return;
    
    // Extract specific semester-section combinations
    // Handle patterns like BSCS-6, BSCS-6A, BSCS-6/BSSE-6, etc.
    const programText = prog.toString().toUpperCase();
    
    // Find all program codes in the string
    const matches = programText.match(/(BSCS|BSSE|BSAI|MSCS|MSIT)[-\s]?(\d+)([A-Z])?/gi);
    
    if (matches) {
      matches.forEach(match => {
        const cleanMatch = match.replace(/\s+/g, '');
        const matchResult = cleanMatch.match(/([A-Z]+)[-\s]?(\d+)([A-Z])?/i);
        
        if (matchResult) {
          const program = matchResult[1].toUpperCase();
          const semester = matchResult[2];
          const section = matchResult[3] || '';
          
          const sectionKey = section ? `${program}-${semester}${section}` : `${program}-${semester}`;
          const generalKey = `${program}-${semester}`;
          
          // Store in general semester group
          if (!semesterGroups[generalKey]) {
            semesterGroups[generalKey] = {
              program: program,
              semester: semester,
              sections: new Set(),
              count: 0
            };
          }
          
          if (section) {
            semesterGroups[generalKey].sections.add(section);
          }
          semesterGroups[generalKey].count++;
          
          // Store row by specific section
          if (!programData[sectionKey]) {
            programData[sectionKey] = [];
          }
          programData[sectionKey].push(row);
          
          // Also store in general program-semester
          if (!programData[generalKey]) {
            programData[generalKey] = [];
          }
          programData[generalKey].push(row);
        }
      });
    }
  });
  
  console.log('Semester sections extracted:', Object.keys(programData).length);
}

// ===== RENDER FUNCTIONS =====
function renderTable(rows) {
  console.log('Rendering table with', rows.length, 'rows');
  
  const tableHeader = document.getElementById('tableHeader');
  const tableBody = document.getElementById('tableBody');
  
  if (!tableHeader || !tableBody) {
    console.error('Table elements not found!');
    return;
  }
  
  // Clear existing content
  tableHeader.innerHTML = '';
  tableBody.innerHTML = '';
  
  // Create header
  if (header && header.length > 0) {
    header.forEach(cell => {
      const th = document.createElement('th');
      th.textContent = cell || '';
      tableHeader.appendChild(th);
    });
  }
  
  // Create rows
  if (rows.length > 1) {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, rows.length - 1);
    const pageRows = rows.slice(startIndex + 1, endIndex + 1);
    
    console.log('Showing rows', startIndex + 1, 'to', endIndex);
    
    pageRows.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.addEventListener('click', () => showExamDetails(row));
      tr.style.cursor = 'pointer';
      
      row.forEach((cell, cellIndex) => {
        const td = document.createElement('td');
        
        // Format cells based on column
        if (cellIndex === 0) { // Date
          td.textContent = cell || '';
          td.style.fontFamily = "'JetBrains Mono', monospace";
          td.style.fontWeight = '500';
        } else if (cellIndex === 5) { // Number of students
          td.textContent = cell || '0';
          td.style.fontWeight = '600';
          td.style.color = 'var(--primary)';
          td.style.textAlign = 'center';
        } else if (cellIndex === 6) { // Timing
          td.style.fontFamily = "'JetBrains Mono', monospace";
          td.textContent = cell || '';
        } else if (cellIndex === 9) { // Room No
          td.style.fontWeight = '600';
          td.style.color = 'var(--secondary)';
          td.textContent = cell || '';
        } else {
          td.textContent = cell || '';
        }
        
        tr.appendChild(td);
      });
      
      tableBody.appendChild(tr);
    });
    
    // Update pagination
    updatePagination(rows.length - 1);
    showEmptyState(false);
  } else {
    console.log('No rows to display');
    showEmptyState(true);
  }
}

function updatePagination(totalRows) {
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  
  document.getElementById('totalRows').textContent = totalRows;
  document.getElementById('visibleRows').textContent = Math.min(rowsPerPage, totalRows - (currentPage - 1) * rowsPerPage);
  document.getElementById('currentPage').textContent = currentPage;
  document.getElementById('totalPages').textContent = totalPages;
}

function changePage(delta) {
  const totalRows = filteredRows.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderTable([header, ...filteredRows]);
  }
}

// ===== PROGRAM/SECTION FILTERING =====
function updateProgramList() {
  console.log('Updating program list...');
  const programList = document.getElementById('programList');
  
  if (!programList) {
    console.error('Program list element not found!');
    return;
  }
  
  programList.innerHTML = '';
  
  if (Object.keys(semesterGroups).length === 0) {
    programList.innerHTML = `
      <div class="no-programs">
        <i class="fas fa-info-circle"></i>
        <p>Upload an Excel file to see programs</p>
      </div>
    `;
    return;
  }
  
  // Group by program
  const programs = {};
  Object.keys(semesterGroups).forEach(key => {
    const group = semesterGroups[key];
    const program = group.program;
    
    if (!programs[program]) {
      programs[program] = [];
    }
    programs[program].push(group);
  });
  
  // Create program groups
  Object.keys(programs).sort().forEach(program => {
    const groups = programs[program];
    
    const programGroup = document.createElement('div');
    programGroup.className = 'program-group';
    
    const groupHeader = document.createElement('div');
    groupHeader.className = 'program-group-header';
    groupHeader.onclick = () => toggleProgramGroup(program);
    
    const groupTitle = document.createElement('div');
    groupTitle.className = 'program-group-title';
    groupTitle.innerHTML = `
      <i class="fas fa-university"></i>
      <span>${program}</span>
    `;
    
    const groupCount = document.createElement('span');
    groupCount.className = 'program-group-count';
    groupCount.textContent = groups.length;
    
    groupHeader.appendChild(groupTitle);
    groupHeader.appendChild(groupCount);
    
    const sectionsContainer = document.createElement('div');
    sectionsContainer.className = 'program-sections';
    sectionsContainer.id = `sections-${program}`;
    sectionsContainer.style.display = 'grid'; // Default to showing
    
    // Add ALL section for this program
    const allSectionBtn = document.createElement('button');
    allSectionBtn.className = 'program-section-btn';
    allSectionBtn.innerHTML = `
      <i class="fas fa-layer-group"></i>
      <span>All ${program}</span>
      <span class="section-badge">ALL</span>
    `;
    allSectionBtn.onclick = () => filterBySection(`${program}-ALL`);
    if (currentProgram === `${program}-ALL`) allSectionBtn.classList.add('active');
    sectionsContainer.appendChild(allSectionBtn);
    
    // Add individual semester sections
    groups.sort((a, b) => parseInt(a.semester) - parseInt(b.semester)).forEach(group => {
      // Main semester button (includes all sections)
      const semesterBtn = document.createElement('button');
      semesterBtn.className = 'program-section-btn';
      
      const sectionCount = group.sections.size > 0 ? group.sections.size : 1;
      semesterBtn.innerHTML = `
        <i class="fas fa-calendar-alt"></i>
        <span>${program}-${group.semester}</span>
        <span class="section-badge">${group.count}</span>
      `;
      
      semesterBtn.onclick = (e) => {
        e.stopPropagation();
        filterBySection(`${program}-${group.semester}`);
      };
      
      if (currentProgram === `${program}-${group.semester}`) semesterBtn.classList.add('active');
      sectionsContainer.appendChild(semesterBtn);
      
      // Add individual sections if they exist
      const sections = Array.from(group.sections).sort();
      if (sections.length > 0) {
        sections.forEach(section => {
          const sectionKey = `${program}-${group.semester}${section}`;
          
          const individualSectionBtn = document.createElement('button');
          individualSectionBtn.className = 'program-section-btn';
          individualSectionBtn.style.marginLeft = '10px';
          individualSectionBtn.style.fontSize = '0.8rem';
          individualSectionBtn.innerHTML = `
            <i class="fas fa-grip-vertical"></i>
            <span>Section ${section}</span>
          `;
          
          individualSectionBtn.onclick = (e) => {
            e.stopPropagation();
            filterBySection(sectionKey);
          };
          
          if (currentProgram === sectionKey) individualSectionBtn.classList.add('active');
          sectionsContainer.appendChild(individualSectionBtn);
        });
      }
    });
    
    programGroup.appendChild(groupHeader);
    programGroup.appendChild(sectionsContainer);
    programList.appendChild(programGroup);
  });
  
  console.log('Program list updated with', Object.keys(programs).length, 'programs');
}

function toggleProgramGroup(program) {
  const sections = document.getElementById(`sections-${program}`);
  if (sections) {
    const isHidden = sections.style.display === 'none';
    sections.style.display = isHidden ? 'grid' : 'none';
  }
}

function filterBySection(sectionKey) {
  console.log('Filtering by section:', sectionKey);
  
  currentProgram = sectionKey;
  currentPage = 1;
  
  // Update UI
  updateProgramSelectionUI(sectionKey);
  
  // Get filtered rows
  if (sectionKey === 'ALL') {
    filteredRows = programData['ALL'] || [];
  } else if (sectionKey.endsWith('-ALL')) {
    // Handle ALL sections for a program (e.g., BSCS-ALL)
    const program = sectionKey.replace('-ALL', '');
    filteredRows = [];
    Object.keys(programData).forEach(key => {
      if (key.startsWith(program + '-')) {
        filteredRows = filteredRows.concat(programData[key]);
      }
    });
    // Remove duplicates
    const uniqueRows = [];
    const seen = new Set();
    filteredRows.forEach(row => {
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRows.push(row);
      }
    });
    filteredRows = uniqueRows;
  } else {
    // Try exact match first
    filteredRows = programData[sectionKey] || [];
    
    // If no exact match, try broader section
    if (filteredRows.length === 0) {
      const match = sectionKey.match(/([A-Z]+)-(\d+)([A-Z]?)/);
      if (match) {
        const program = match[1];
        const semester = match[2];
        
        // Get all sections for this semester
        filteredRows = [];
        Object.keys(programData).forEach(key => {
          if (key.startsWith(`${program}-${semester}`)) {
            filteredRows = filteredRows.concat(programData[key]);
          }
        });
        // Remove duplicates
        const uniqueRows = [];
        const seen = new Set();
        filteredRows.forEach(row => {
          const key = JSON.stringify(row);
          if (!seen.has(key)) {
            seen.add(key);
            uniqueRows.push(row);
          }
        });
        filteredRows = uniqueRows;
      }
    }
  }
  
  // Render table
  renderTable([header, ...filteredRows]);
  
  // Update program info
  updateSelectedProgramInfo(sectionKey);
  
  // Show toast
  showToast(`Showing ${filteredRows.length} exams for ${sectionKey.replace('-ALL', ' ALL')}`, 'info');
}

function updateProgramSelectionUI(sectionKey) {
  // Remove active class from all buttons
  document.querySelectorAll('.program-section-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Add active class to selected button
  const buttons = document.querySelectorAll('.program-section-btn');
  buttons.forEach(btn => {
    if (sectionKey === 'ALL' && btn.textContent.includes('All CS')) {
      btn.classList.add('active');
    } else if (btn.textContent.includes(sectionKey.replace('-ALL', ''))) {
      btn.classList.add('active');
    }
  });
}

function updateSelectedProgramInfo(sectionKey) {
  const programName = document.getElementById('selectedProgramName');
  const programExams = document.getElementById('programExams');
  const programStudents = document.getElementById('programStudents');
  const programRooms = document.getElementById('programRooms');
  const currentProgramElement = document.getElementById('currentProgram');
  
  if (!programName || !programExams || !programStudents || !programRooms || !currentProgramElement) {
    console.error('Program info elements not found!');
    return;
  }
  
  let displayName = "All Computer Science Programs";
  let examCount = filteredRows.length;
  let studentCount = 0;
  let roomSet = new Set();
  
  // Calculate statistics
  filteredRows.forEach(row => {
    const students = parseInt(row[5]) || 0;
    studentCount += students;
    
    if (row[9]) {
      const rooms = row[9].toString().split('/');
      rooms.forEach(room => {
        const trimmedRoom = room.trim();
        if (trimmedRoom) roomSet.add(trimmedRoom);
      });
    }
  });
  
  if (sectionKey !== 'ALL') {
    displayName = sectionKey.replace('-', ' ').replace('ALL', 'All Sections');
  }
  
  programName.textContent = displayName;
  programExams.textContent = examCount;
  programStudents.textContent = studentCount.toLocaleString();
  programRooms.textContent = roomSet.size;
  currentProgramElement.textContent = displayName;
}

// ===== STATISTICS =====
function calculateStatistics() {
  console.log('Calculating statistics...');
  
  const rows = programData['ALL'] || [];
  
  stats.totalExams = rows.length;
  stats.totalStudents = rows.reduce((sum, row) => sum + (parseInt(row[5]) || 0), 0);
  
  // Calculate unique rooms
  const roomSet = new Set();
  rows.forEach(row => {
    if (row[9]) {
      const rooms = row[9].toString().split('/');
      rooms.forEach(room => {
        const trimmedRoom = room.trim();
        if (trimmedRoom) roomSet.add(trimmedRoom);
      });
    }
  });
  stats.totalRooms = roomSet.size;
  
  // Calculate unique faculty (from TEACHERS NAME column)
  const facultySet = new Set();
  rows.forEach(row => {
    if (row[7]) {
      const teachers = row[7].toString().split('/');
      teachers.forEach(teacher => {
        const trimmedTeacher = teacher.trim();
        if (trimmedTeacher) facultySet.add(trimmedTeacher);
      });
    }
  });
  stats.activeFaculty = facultySet.size;
  
  console.log('Statistics calculated:', stats);
}

function updateStatsUI() {
  console.log('Updating stats UI:', stats);
  
  const totalExamsElement = document.getElementById('totalExams');
  const totalStudentsElement = document.getElementById('totalStudents');
  const totalRoomsElement = document.getElementById('totalRooms');
  const activeFacultyElement = document.getElementById('activeFaculty');
  
  if (totalExamsElement) totalExamsElement.textContent = stats.totalExams.toLocaleString();
  if (totalStudentsElement) totalStudentsElement.textContent = stats.totalStudents.toLocaleString();
  if (totalRoomsElement) totalRoomsElement.textContent = stats.totalRooms.toLocaleString();
  if (activeFacultyElement) activeFacultyElement.textContent = stats.activeFaculty.toLocaleString();
}

// ===== UI CONTROLS =====
function toggleTheme() {
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
  localStorage.setItem('theme', newTheme);
  showToast(`Switched to ${newTheme} theme`, 'info');
}

function setTheme(theme) {
  currentTheme = theme;
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}

function toggleLang() {
  const langText = document.getElementById('langText');
  
  if (!langText) return;
  
  if (currentLang === "EN") {
    langText.textContent = "English";
    currentLang = "UR";
  } else {
    langText.textContent = "اردو";
    currentLang = "EN";
  }
}

function toggleSidebar() {
  const sidebar = document.querySelector('.program-sidebar');
  const toggleIcon = document.querySelector('.sidebar-toggle i');
  
  if (!sidebar || !toggleIcon) return;
  
  if (sidebar.style.width === '0px' || sidebar.style.width === '0' || !sidebar.style.width) {
    sidebar.style.width = '320px';
    toggleIcon.className = 'fas fa-chevron-left';
  } else {
    sidebar.style.width = '0';
    toggleIcon.className = 'fas fa-chevron-right';
  }
}

function switchView(view) {
  const tableView = document.getElementById('tableView');
  const calendarView = document.getElementById('calendarView');
  const viewButtons = document.querySelectorAll('.view-btn');
  
  if (!tableView || !calendarView) return;
  
  viewButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.view === view) btn.classList.add('active');
  });
  
  if (view === 'table') {
    tableView.style.display = 'block';
    calendarView.style.display = 'none';
  } else {
    tableView.style.display = 'none';
    calendarView.style.display = 'block';
    renderCalendarView();
  }
}

function filterSemesters() {
  const searchTerm = document.getElementById('searchFilter').value.toLowerCase();
  const buttons = document.querySelectorAll('.program-section-btn');
  
  buttons.forEach(btn => {
    const text = btn.textContent.toLowerCase();
    if (text.includes(searchTerm)) {
      btn.style.display = 'flex';
    } else {
      btn.style.display = 'none';
    }
  });
}

function filterTable() {
  const searchTerm = document.getElementById('tableSearch').value.toLowerCase();
  const rows = document.querySelectorAll('#tableBody tr');
  let visibleCount = 0;
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    if (text.includes(searchTerm)) {
      row.style.display = '';
      visibleCount++;
    } else {
      row.style.display = 'none';
    }
  });
  
  // Update visible rows count
  document.getElementById('visibleRows').textContent = visibleCount;
}

function clearAllFilters() {
  currentProgram = 'ALL';
  currentPage = 1;
  filteredRows = programData['ALL'] || [];
  
  renderTable([header, ...filteredRows]);
  updateProgramSelectionUI('ALL');
  updateSelectedProgramInfo('ALL');
  
  const searchFilter = document.getElementById('searchFilter');
  const tableSearch = document.getElementById('tableSearch');
  
  if (searchFilter) searchFilter.value = '';
  if (tableSearch) tableSearch.value = '';
  
  // Show all semester buttons
  document.querySelectorAll('.program-section-btn').forEach(btn => {
    btn.style.display = 'flex';
  });
  
  showToast('All filters cleared', 'info');
}

function refreshData() {
  if (allRows.length === 0) {
    showToast('No data to refresh', 'warning');
    return;
  }
  
  showLoading(true);
  setTimeout(() => {
    renderTable([header, ...filteredRows]);
    showLoading(false);
    showToast('Data refreshed successfully', 'success');
  }, 500);
}

// ===== EXPORT FUNCTIONS =====
function downloadExcel() {
  if (allRows.length === 0) {
    showToast('No data to export. Please upload a file first.', 'error');
    return;
  }
  
  try {
    const ws = XLSX.utils.aoa_to_sheet(allRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Exam Schedule");
    XLSX.writeFile(wb, `UOL_CS_Exam_Schedule_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Excel file downloaded successfully', 'success');
  } catch (error) {
    showToast('Error exporting to Excel: ' + error.message, 'error');
  }
}

function downloadPDF() {
  if (allRows.length === 0) {
    showToast('No data to export. Please upload a file first.', 'error');
    return;
  }
  
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "mm", "a4");
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text("UNIVERSITY OF LAHORE", 14, 20);
    
    doc.setFontSize(16);
    doc.text("Computer Science Department", 14, 30);
    
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Exam Schedule: ${currentProgram === 'ALL' ? 'All Programs' : currentProgram}`, 14, 40);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 47);
    
    // Prepare data for PDF
    const pdfData = filteredRows.map(row => {
      return row.map(cell => cell || '');
    });
    
    // Table
    doc.autoTable({
      startY: 55,
      head: [header],
      body: pdfData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] },
      alternateRowStyles: { fillColor: [240, 240, 240] },
      margin: { left: 14, right: 14 }
    });
    
    doc.save(`UOL_CS_Schedule_${currentProgram}_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('PDF file downloaded successfully', 'success');
  } catch (error) {
    showToast('Error exporting to PDF: ' + error.message, 'error');
  }
}

// ===== DRAG AND DROP =====
function initializeDragAndDrop() {
  const uploadArea = document.querySelector('.upload-area');
  const uploadInput = document.getElementById('upload');
  
  if (!uploadArea || !uploadInput) {
    console.error('Upload elements not found!');
    return;
  }
  
  // Drag and drop events
  uploadArea.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.add('dragover');
  });
  
  uploadArea.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('dragover');
  });
  
  uploadArea.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadInput.files = files;
      
      // Show file name
      updateFileName(files[0].name);
      
      // Trigger file processing
      const event = new Event('change');
      uploadInput.dispatchEvent(event);
    }
  });
  
  // Click on upload area to trigger file input
  uploadArea.addEventListener('click', function(e) {
    if (e.target !== uploadInput) {
      uploadInput.click();
    }
  });
  
  // Show file name when selected via browse
  uploadInput.addEventListener('change', function(e) {
    if (this.files[0]) {
      updateFileName(this.files[0].name);
    }
  });
}

function updateFileName(fileName) {
  const uploadArea = document.querySelector('.upload-area');
  if (!uploadArea) return;
  
  // Remove previous file name if exists
  const existingName = uploadArea.parentElement.querySelector('.file-name');
  if (existingName) {
    existingName.remove();
  }
  
  // Add new file name
  const fileNameElement = document.createElement('div');
  fileNameElement.className = 'file-name';
  fileNameElement.textContent = fileName;
  fileNameElement.title = fileName;
  
  uploadArea.parentElement.appendChild(fileNameElement);
}

// ===== UTILITY FUNCTIONS =====
function showLoading(show) {
  const loadingState = document.getElementById('loadingState');
  const tableView = document.getElementById('tableView');
  
  if (!loadingState || !tableView) return;
  
  if (show) {
    loadingState.style.display = 'flex';
    tableView.style.display = 'none';
  } else {
    loadingState.style.display = 'none';
    tableView.style.display = 'block';
  }
}

function showEmptyState(show) {
  const emptyState = document.getElementById('emptyState');
  const tableView = document.getElementById('tableView');
  
  if (!emptyState || !tableView) return;
  
  if (show) {
    emptyState.style.display = 'flex';
    tableView.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    tableView.style.display = 'block';
  }
}

function showExamDetails(row) {
  const modal = document.getElementById('examModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  
  if (!modal || !modalTitle || !modalBody) return;
  
  modalTitle.textContent = row[4] || 'Exam Details';
  
  modalBody.innerHTML = `
    <div class="exam-details-grid">
      <div class="detail-item">
        <span class="detail-label">Date:</span>
        <span class="detail-value">${row[0] || '-'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Day:</span>
        <span class="detail-value">${row[1] || '-'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Program:</span>
        <span class="detail-value">${row[2] || '-'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Subject:</span>
        <span class="detail-value">${row[4] || '-'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Students:</span>
        <span class="detail-value">${row[5] || '0'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Timing:</span>
        <span class="detail-value">${row[6] || '-'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Teacher:</span>
        <span class="detail-value">${row[7] || '-'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Invigilator:</span>
        <span class="detail-value">${row[8] || '-'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Room:</span>
        <span class="detail-value">${row[9] || '-'}</span>
      </div>
    </div>
  `;
  
  modal.classList.add('active');
}

function closeModal() {
  const modal = document.getElementById('examModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle'
  };
  
  toast.innerHTML = `
    <i class="toast-icon ${icons[type] || icons.info}"></i>
    <div class="toast-content">
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  container.appendChild(toast);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 5000);
}

// ===== CALENDAR VIEW =====
function renderCalendarView() {
  const container = document.getElementById('calendarContainer');
  if (!container) return;
  
  container.innerHTML = `
    <div class="calendar-placeholder">
      <i class="fas fa-calendar-alt"></i>
      <h3>Calendar View</h3>
      <p>Calendar view will be available in the next update</p>
      <button class="primary-btn" onclick="switchView('table')">
        <i class="fas fa-table"></i> Switch to Table View
      </button>
    </div>
  `;
}

// ===== EVENT LISTENERS =====
// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', function() {
  const modal = document.getElementById('examModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === this) {
        closeModal();
      }
    });
  }
  
  // Prevent modal close when clicking inside modal content
  const modalContent = document.querySelector('.modal-content');
  if (modalContent) {
    modalContent.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }
  
  // Initialize search filters
  const searchFilter = document.getElementById('searchFilter');
  const tableSearch = document.getElementById('tableSearch');
  
  if (searchFilter) {
    searchFilter.addEventListener('input', filterSemesters);
  }
  
  if (tableSearch) {
    tableSearch.addEventListener('input', filterTable);
  }
  
  // Initialize view buttons
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const view = this.dataset.view;
      switchView(view);
    });
  });
});

// ===== DEBUGGING HELPERS =====
// Add this to help debug
window.debugData = function() {
  console.log('=== DEBUG INFO ===');
  console.log('All rows length:', allRows.length);
  console.log('Filtered rows length:', filteredRows.length);
  console.log('Semester groups:', semesterGroups);
  console.log('Program data keys:', Object.keys(programData));
  console.log('Stats:', stats);
  console.log('Current program:', currentProgram);
  console.log('Header:', header);
  console.log('=== END DEBUG ===');
};
// ===== INSTRUCTION MODAL FUNCTIONS =====
function showInstructionModal() {
    const dontShowAgain = localStorage.getItem('dontShowInstructions');
    
    // Only show if user hasn't checked "Don't show again"
    if (dontShowAgain !== 'true') {
        const modal = document.getElementById('instructionModal');
        if (modal) {
            // Show after a short delay
            setTimeout(() => {
                modal.style.display = 'flex';
                document.body.style.overflow = 'hidden'; // Prevent scrolling
            }, 500);
        }
    }
}

function closeInstruction() {
    const modal = document.getElementById('instructionModal');
    const dontShowCheckbox = document.getElementById('dontShowAgain');
    
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = ''; // Restore scrolling
        
        // Save preference if checkbox is checked
        if (dontShowCheckbox && dontShowCheckbox.checked) {
            localStorage.setItem('dontShowInstructions', 'true');
        }
        
        // Show a welcome toast
        showToast('Welcome! Upload an Excel file to get started.', 'info');
    }
}

// ===== UPDATE INITIALIZATION =====
// Modify the existing DOMContentLoaded event listener in script.js
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing application...');
    
    // Initialize theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    
    // Initialize drag and drop
    initializeDragAndDrop();
    
    // Add event listeners
    const uploadInput = document.getElementById('upload');
    if (uploadInput) {
        uploadInput.addEventListener('change', handleFile);
        console.log('File input listener added');
    } else {
        console.error('Upload input not found!');
    }
    
    // Set current date
    const now = new Date();
    document.getElementById('currentDate').textContent = formatDateDisplay(now);
    document.getElementById('scheduleDate').textContent = formatDateDisplay(now);
    
    // Initialize UI
    showLoading(false);
    showEmptyState(true);
    updateStatsUI();
    
    // Show instruction modal
    showInstructionModal();
    
    console.log('Application initialized successfully');
});
// Add keyboard support for closing instruction modal with Escape key
document.addEventListener('keydown', function(e) {
    const instructionModal = document.getElementById('instructionModal');
    if (e.key === 'Escape' && instructionModal && instructionModal.style.display === 'flex') {
        closeInstruction();
    }
});

// ===== PORTFOLIO FUNCTIONS =====
function showPortfolioInfo() {
    const portfolioInfo = document.getElementById('portfolioInfo');
    if (portfolioInfo) {
        portfolioInfo.style.display = 'block';
    }
}

function hidePortfolioInfo() {
    const portfolioInfo = document.getElementById('portfolioInfo');
    if (portfolioInfo) {
        portfolioInfo.style.display = 'none';
    }
}

function copyContactInfo() {
    const contactInfo = `M Hassan Asghar\nFull Stack Developer (CS)\nPhone: 0340-7542382\nEmail: hj0889297@gmail.com`;
    
    navigator.clipboard.writeText(contactInfo)
        .then(() => {
            showToast('Contact information copied to clipboard!', 'success');
        })
        .catch(err => {
            console.error('Failed to copy: ', err);
            showToast('Failed to copy contact info', 'error');
        });
}

// Close portfolio info when clicking outside
document.addEventListener('click', function(event) {
    const portfolioInfo = document.getElementById('portfolioInfo');
    const portfolioBtn = document.querySelector('.portfolio-btn');
    
    if (portfolioInfo && portfolioBtn && 
        !portfolioInfo.contains(event.target) && 
        !portfolioBtn.contains(event.target) &&
        portfolioInfo.style.display === 'block') {
        portfolioInfo.style.display = 'none';
    }
});