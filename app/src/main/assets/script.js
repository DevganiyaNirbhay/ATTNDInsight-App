function openFileManager() {
    if (typeof AndroidDownloader !== 'undefined' && AndroidDownloader.openFileManager) {
        AndroidDownloader.openFileManager();
    } else {
        showAlertDialog("Error", "Native interface not found.");
    }
}

function copyId() {
    const idText = document.getElementById('displayId').innerText;
    if (!idText || idText === "---") return;

    const tempInput = document.createElement("input");
    tempInput.value = idText;
    document.body.appendChild(tempInput);
    tempInput.select();
    tempInput.setSelectionRange(0, 99999); // For mobile devices

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showAlertDialog("ID Copied", "Principal ID copied: " + idText);
        } else {
            showAlertDialog("Error", "Failed to copy ID");
        }
    } catch (err) {
        showAlertDialog("Error", "Failed to copy ID");
    }

    document.body.removeChild(tempInput);
}

// Helper function to normalize name for comparison: lowercase, trim, and sort words alphabetically
function normalizeStudentName(name) {
    if (!name) return "";
    // Lowercase, trim, remove multiple spaces, split into words, sort words alphabetically, join back
    return name.toLowerCase().trim().replace(/\s+/g, ' ').split(' ').sort().join(' ');
}

// New helper function for flexible name comparison
function areNamesCompatible(n1, n2) {
    if (n1 === n2) return true;
    if (!n1 || !n2) return false;

    // We use the already normalized names (which are space-separated sorted words)
    const s1 = new Set(n1.split(' '));
    const s2 = new Set(n2.split(' '));

    const isSubset = (setA, setB) => {
        for (let elem of setA) {
            if (!setB.has(elem)) return false;
        }
        return true;
    };

    // Return true if one name's words are a subset of the other's
    return isSubset(s1, s2) || isSubset(s2, s1);
}

// Helper to handle date range changes with validation
function handleDateRangeChange(fromId, toId, callback) {
    const fEl = document.getElementById(fromId);
    const tEl = document.getElementById(toId);
    const errSpan = document.getElementById('dateRangeError');

    if (!fEl || !tEl) return;

    const fr = fEl.value;
    const to = tEl.value;

    if (fr && to && fr > to) {
        showAlertDialog("Error", "Invalid date select");
        // Revert to last valid dates
        fEl.value = fEl.getAttribute('data-date');
        tEl.value = tEl.getAttribute('data-date');
        if (errSpan) errSpan.classList.remove('hidden');
    } else {
        // Valid: Update last valid dates and run callback
        fEl.setAttribute('data-date', fr);
        tEl.setAttribute('data-date', to);
        if (errSpan) errSpan.classList.add('hidden');
        if (callback) callback();
    }
}

// Ye check karega ki classes kitni hain aur unke students match ho rahe hain ya nahi
function checkSelectionCount() {
    const checkedBoxes = document.querySelectorAll('input[name="os"]:checked');
    const btn = document.getElementById('generateTableBtn');
    const errorMsg = document.getElementById('mismatchErrorMsg');

    if (checkedBoxes.length > 1) {
        let isMismatch = false;
        let referenceData = null; // Map: RollNo -> NormalizedName

        // Har selected class ke students ka data nikal kar compare karna
        for (let i = 0; i < checkedBoxes.length; i++) {
            const cb = checkedBoxes[i];
            const cName = cb.value;
            const tId = cb.getAttribute('data-tid');

            // LocalStorage se data uthana
            const rawData = localStorage.getItem(`attnd_data_${currentPrincipalId}_${tId}`);
            if (rawData) {
                const d = JSON.parse(rawData);

                // Is class ke baccho ki list nikalna (New hierarchical structure)
                const classData = d.classes ? d.classes[cName] : null;
                if (classData && classData.students) {
                    const students = Object.values(classData.students);

                    // Create current class signature map
                    const currentMap = {};
                    students.forEach(s => {
                        currentMap[String(s.rollNo).trim()] = normalizeStudentName(s.name);
                    });

                    if (referenceData === null) {
                        referenceData = currentMap;
                    } else {
                        const refKeys = Object.keys(referenceData);
                        const curKeys = Object.keys(currentMap);

                        if (refKeys.length !== curKeys.length) {
                            isMismatch = true;
                            break;
                        }

                        for (let roll of refKeys) {
                            if (!areNamesCompatible(referenceData[roll], currentMap[roll])) {
                                isMismatch = true;
                                break;
                            }
                        }
                    }
                } else {
                    isMismatch = true;
                    break;
                }
            }
            if (isMismatch) break;
        }

        // Result ke hisaab se UI change karna
        if (isMismatch) {
            btn.classList.add('hidden');          // Button chhupao
            errorMsg.classList.remove('hidden');  // Mismatch error dikhao
        } else {
            btn.classList.remove('hidden');       // Sab sahi hai, toh button dikhao
            errorMsg.classList.add('hidden');     // Error chhupao
        }
    } else {
        // Agar 0 ya sirf 1 class select ki hai, toh dono chizein chhupa do
        btn.classList.add('hidden');
        errorMsg.classList.add('hidden');
    }
}

const firebaseConfig = {
   
    authDomain: "attnd-app.firebaseapp.com",
    
    
    
    apiKey: " your value ",

    databaseURL: " your value ",
    projectId: " your value ",
    storageBucket: " your value ",
    messagingSenderId: " your value ",
    appId: " your value "

    // download ATTND from my github : https://github.com/DevganiyaNirbhay/Attendance-App 
    // and get google-services.jason file from this project and you can see above your value , but you need to register ATTND app in firebase  
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentPrincipalId = "";
let currentReportTab = "day";
let facultyData = null;
let selectedFacultyId = "";
let sortState = 0;

// New variable to track export context
let isOverallExport = false;

window.onload = function() {
    const session = localStorage.getItem('attnd_p_session');
    if (session) {
        const data = JSON.parse(session);
        currentPrincipalId = data.id;
        document.getElementById('displayId').innerText = data.id;
        document.getElementById('profileName').innerText = data.name;
        window.history.replaceState({dest: 'faculty'}, "", "#faculty");
        renderFragment('faculty');
    } else {
        document.getElementById('loginSection').classList.remove('hidden');
    }
};

// Navigation Logic
window.onpopstate = (e) => renderFragment((e.state && e.state.dest) ? e.state.dest : 'faculty');

function requestNavigate(dest) {
    if (window.location.hash === '#' + dest) return;
    window.history.pushState({dest: dest}, "", "#" + dest);
    renderFragment(dest);
}

function updateNavIndicator(dest) {
    const nav = document.getElementById('bottomNav');
    const indicator = document.getElementById('navIndicator');
    if (!nav || !indicator) return;

    let activeItem;
    if (['faculty', 'reports'].includes(dest)) activeItem = document.querySelectorAll('.nav-item')[0];
    else if (['overall_setup', 'overall_view'].includes(dest)) activeItem = document.querySelectorAll('.nav-item')[1];
    else if (dest === 'profile') activeItem = document.querySelectorAll('.nav-item')[2];

    if (activeItem) {
        const rect = activeItem.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();

        const width = rect.width * 0.85;
        const left = (rect.left - navRect.left) + (rect.width - width) / 2;

        indicator.style.width = width + 'px';
        indicator.style.left = left + 'px';
        indicator.style.top = '7.5px';
    }
}

function renderFragment(dest) {
    document.querySelectorAll('.fragment').forEach(f => f.classList.add('hidden'));

    // SAFE FRAGMENT SELECTION
    const targetFrag = document.getElementById('frag_' + dest);
    if(targetFrag) {
        targetFrag.classList.remove('hidden');
    }

    document.getElementById('scrollArea').scrollTop = 0;

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    if (['faculty', 'reports'].includes(dest)) document.querySelectorAll('.nav-item')[0].classList.add('active');
    else if (['overall_setup', 'overall_view'].includes(dest)) document.querySelectorAll('.nav-item')[1].classList.add('active');
    else if (dest === 'profile') document.querySelectorAll('.nav-item')[2].classList.add('active');

    updateNavIndicator(dest);

    const b = document.getElementById('backBtn');
    const t = document.getElementById('headerTitle');
    const sub = document.getElementById('headerSubtitle');
    const dlBtn = document.getElementById('headerDownloadBtn');

    b.classList.add('hidden');
    if (sub) sub.classList.add('hidden');
    if (dlBtn) dlBtn.classList.add('hidden');

    if (dest === 'faculty') {
        t.innerText = "Faculty";
    } else if (dest === 'reports') {
        t.innerText = "Records";
        b.classList.remove('hidden');
        if (sub) sub.classList.remove('hidden');
        if (dlBtn) {
            dlBtn.classList.remove('hidden');
            dlBtn.onclick = openExportDialog;
        }
    } else if (dest === 'overall_setup') {
        t.innerText = "Overall Summary";
    } else if (dest === 'overall_view') {
        t.innerText = "Summary";
        b.classList.remove('hidden');
        if (dlBtn) {
            dlBtn.classList.remove('hidden');
            dlBtn.onclick = openOverallExportDialog;
        }
    } else if (dest === 'profile') {
        t.innerText = "Profile";
    }

    if (dest === 'faculty') loadFaculties();
    if (dest === 'overall_setup') setupOverallSummary();
}

async function handleAuth() {
    const name = document.getElementById('principalName').value.trim();
    if (!name) return;
    const id = "PR" + Math.random().toString(36).substring(2, 7).toUpperCase();
    await db.ref('Users/PRINCIPAL/' + id).set({ name, subject: "Principal", principalId: id });
    localStorage.setItem('attnd_p_session', JSON.stringify({ id, name }));
    location.reload();
}

function openEditProfileDialog() {
    const session = JSON.parse(localStorage.getItem('attnd_p_session'));
    document.getElementById('editName').value = session.name;
    document.getElementById('editId').value = session.id;
    document.getElementById('editProfileOverlay').classList.remove('hidden');
}

function closeEditProfileDialog() {
    document.getElementById('editProfileOverlay').classList.add('hidden');
}

async function handleEditProfile() {
    const newName = document.getElementById('editName').value.trim();
    const newId = document.getElementById('editId').value.trim();
    const session = JSON.parse(localStorage.getItem('attnd_p_session'));
    const oldId = session.id;

    if (!newName) return showAlertDialog("Error", "Name cannot be empty");
    if (!newId) return showAlertDialog("Error", "ID cannot be empty");

    const saveBtn = document.getElementById('saveProfileBtn');
    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";

    try {
        if (newId !== oldId) {
            // 1. Check if new ID already exists
            const existingSnap = await db.ref('Users/PRINCIPAL/' + newId).once('value');
            if (existingSnap.exists()) {
                showAlertDialog("Error", "This ID is already taken. Please choose another one.");
                saveBtn.disabled = false;
                saveBtn.innerText = "SAVE";
                return;
            }

            // 2. Start Migration
            // Fetch current principal data
            const oldDataSnap = await db.ref('Users/PRINCIPAL/' + oldId).once('value');
            const oldData = oldDataSnap.val();
            oldData.principalId = newId;
            oldData.name = newName;

            const updates = {};
            // New Principal Node
            updates[`Users/PRINCIPAL/${newId}`] = oldData;
            // Delete Old Principal Node
            updates[`Users/PRINCIPAL/${oldId}`] = null;

            // 3. Update Teacher Connections
            const teachersSnap = await db.ref('Users/TEACHER').orderByChild('principalId').equalTo(oldId).once('value');
            teachersSnap.forEach(t => {
                updates[`Users/TEACHER/${t.key}/principalId`] = newId;
            });

            // 4. Migrate TemporarySync data
            const syncSnap = await db.ref(`TemporarySync/${oldId}`).once('value');
            if (syncSnap.exists()) {
                updates[`TemporarySync/${newId}`] = syncSnap.val();
                updates[`TemporarySync/${oldId}`] = null;
            }

            // Apply all Firebase changes
            await db.ref().update(updates);

            // 5. Migrate LocalStorage data keys
            const keysToMigrate = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k.startsWith(`attnd_data_${oldId}_`)) {
                    keysToMigrate.push(k);
                }
            }

            keysToMigrate.forEach(oldKey => {
                const data = localStorage.getItem(oldKey);
                const newKey = oldKey.replace(`attnd_data_${oldId}_`, `attnd_data_${newId}_`);
                localStorage.setItem(newKey, data);
                localStorage.removeItem(oldKey);
            });

            // Update Session
            localStorage.setItem('attnd_p_session', JSON.stringify({ id: newId, name: newName }));
        } else {
            // Only name changed
            await db.ref('Users/PRINCIPAL/' + oldId + '/name').set(newName);
            localStorage.setItem('attnd_p_session', JSON.stringify({ id: oldId, name: newName }));
        }

        location.reload();

    } catch (e) {
        showAlertDialog("Error", "Failed to update profile: " + e.message);
        saveBtn.disabled = false;
        saveBtn.innerText = "SAVE";
    }
}

async function loadFaculties() {
    const listDiv = document.getElementById('facultyList');
    const facultyMap = new Map();

    // 1. OFFLINE FIRST: Pehle local storage se data dikhao
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(`attnd_data_${currentPrincipalId}_`)) {
            const id = key.replace(`attnd_data_${currentPrincipalId}_`, "");
            try {
                const data = JSON.parse(localStorage.getItem(key));
                facultyMap.set(id, { id: id, name: data.teacherName || "Teacher", subject: data.subject || "Unknown" });
            } catch(e){}
        }
    }

    const renderMap = () => {
        listDiv.innerHTML = "";
        if (facultyMap.size === 0) {
            listDiv.innerHTML = `<div class="card" style="text-align:center; padding:40px; color:#ccc;"><svg class="material-icons" style="font-size:48px;" viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg><p>No teachers connected.</p></div>`;
            return;
        }
        facultyMap.forEach(t => {
            // Re-aggregate subjects from local storage if data is available for accurate display
            let finalSubject = t.subject;
            const rawLocalData = localStorage.getItem(`attnd_data_${currentPrincipalId}_${t.id}`);
            if (rawLocalData) {
                try {
                    const d = JSON.parse(rawLocalData);
                    let subjectList = [];
                    if (d.classes) {
                        Object.values(d.classes).forEach(c => {
                            if (c.subject && !subjectList.includes(c.subject)) {
                                subjectList.push(c.subject);
                            }
                        });
                    }
                    if (subjectList.length > 0) {
                        finalSubject = subjectList.join(', ');
                    }
                } catch(e){}
            }

            const d = document.createElement('div');
            d.className = "faculty-item";
            d.innerHTML = `
                <div class="faculty-icon"><svg class="material-icons" viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
                <div class="faculty-info" onclick="openFaculty('${t.id}', '${t.name}')">
                    <strong>${t.name}</strong>
                    <small>${finalSubject}</small>
                </div>
                <svg class="material-icons delete-btn" onclick="deleteFaculty('${t.id}', '${t.name}', event)" viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            `;
            listDiv.appendChild(d);
        });
    };

    // Render locally saved data instantly
    if(facultyMap.size > 0) {
        renderMap();
    } else {
        listDiv.innerHTML = "<p style='text-align:center; padding:30px; color:#888;'>Loading...</p>";
    }

    // 2. BACKGROUND SYNC: Try to fetch online updates and CLEAR Firebase
    try {
        const linkedSnap = await db.ref('Users/TEACHER').orderByChild('principalId').equalTo(currentPrincipalId).once('value');
        linkedSnap.forEach(child => {
            const t = child.val();
            if(!facultyMap.has(child.key)) {
                facultyMap.set(child.key, { id: child.key, name: t.name, subject: "No Data Yet" });
            }
        });

        const syncRef = db.ref(`TemporarySync/${currentPrincipalId}`);
        const syncSnap = await syncRef.once('value');

        if(syncSnap.exists()){
            const promises = [];
            syncSnap.forEach(child => {
                const data = child.val();
                const teacherId = child.key;

                localStorage.setItem(`attnd_data_${currentPrincipalId}_${teacherId}`, JSON.stringify(data));

                // Aggregate all subjects from all classes
                let subjectList = [];
                if (data.classes) {
                    Object.values(data.classes).forEach(c => {
                        if (c.subject && !subjectList.includes(c.subject)) {
                            subjectList.push(c.subject);
                        }
                    });
                }

                let displaySubject = subjectList.length > 0 ? subjectList.join(', ') : "No Subjects";

                facultyMap.set(teacherId, { id: teacherId, name: data.teacherName || "Unknown", subject: displaySubject });

                // Remove individual teacher node to confirm pickup
                promises.push(child.ref.remove());
            });
            await Promise.all(promises);
        }

        renderMap();

    } catch (e) {
        if(facultyMap.size === 0){
            listDiv.innerHTML = "<p style='text-align:center; padding:30px; color:#F44336;'>You are Offline. Please connect to internet to sync new data.</p>";
        }
        console.warn("Background sync skipped (Offline Mode): ", e);
    }
}

async function deleteFaculty(id, name, event) {
    event.stopPropagation();

    showCustomDialog(
        "Delete Faculty?",
        `Delete ${name}? This will remove all their data and disconnect them.`,
        async () => {
            try {
                closeCustomDialog();
                await db.ref(`Users/TEACHER/${id}/principalId`).remove();
                await db.ref(`TemporarySync/${currentPrincipalId}/${id}`).remove();
                localStorage.removeItem(`attnd_data_${currentPrincipalId}_${id}`);

                loadFaculties();
            } catch (e) {
                showAlertDialog("Error", "Delete failed: " + e.message);
            }
        }
    );
}

function showCustomDialog(title, message, onConfirm, isAlert = false, confirmText = 'DELETE') {
    document.getElementById('dialogTitle').innerText = title;
    document.getElementById('dialogMessage').innerText = message;

    const actionsContainer = document.querySelector('#customDialogOverlay .dialog-actions');
    actionsContainer.innerHTML = ''; // Purane buttons clear karein

    if (isAlert) {
        const okBtn = document.createElement('button');
        okBtn.className = 'dialog-btn';
        okBtn.innerText = 'OK';
        okBtn.onclick = closeCustomDialog;
        actionsContainer.appendChild(okBtn);
    } else {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'dialog-btn';
        cancelBtn.innerText = 'CANCEL';
        cancelBtn.onclick = closeCustomDialog;

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'dialog-btn danger';
        confirmBtn.innerText = confirmText;
        confirmBtn.onclick = onConfirm;

        actionsContainer.appendChild(cancelBtn);
        actionsContainer.appendChild(confirmBtn);
    }

    document.getElementById('customDialogOverlay').classList.remove('hidden');
}

function showAlertDialog(title, message) {
    showCustomDialog(title, message, null, true);
}

function closeCustomDialog() {
    document.getElementById('customDialogOverlay').classList.add('hidden');
}

async function openFaculty(id, name) {
    selectedFacultyId = id;
    document.getElementById('headerSubtitle').innerText = name;

    const local = localStorage.getItem(`attnd_data_${currentPrincipalId}_${id}`);
    facultyData = local ? JSON.parse(local) : null;

    requestNavigate('reports');
    populateClasses();

    document.getElementById('filterCard').classList.add('hidden');
    document.getElementById('reportContent').innerHTML = "";

    switchTab('day', document.querySelector('.tab-pill'));

    try {
        const ref = db.ref(`TemporarySync/${currentPrincipalId}/${id}`);
        const snap = await ref.once('value');
        if (snap.exists()) {
            const data = snap.val();
            localStorage.setItem(`attnd_data_${currentPrincipalId}_${id}`, JSON.stringify(data));
            facultyData = data;
            await ref.remove(); // Clear Firebase
            populateClasses();
            onClassSelected();
        }
    } catch (e) { /* Ignore offline errors */ }
}

// --- Reports Logic ---

function populateClasses() {
    const popup = document.getElementById('classDropdownPopup');
    const trigger = document.getElementById('classSelectorTrigger');

    trigger.querySelector('span').innerText = "Select Class";
    trigger.dataset.value = "";

    popup.innerHTML = "";
    if (facultyData && facultyData.classes) {
        Object.entries(facultyData.classes).forEach(([className, classData]) => {
            const item = document.createElement('div');
            item.className = "dropdown-item";
            item.innerText = className;
            item.onclick = () => selectClass(className);
            popup.appendChild(item);
        });
    }

    if (popup.innerHTML === "") {
        popup.innerHTML = "<div class='dropdown-item' style='color:#999'>No classes found</div>";
    }
}

function onClassSelected() {
    const val = document.getElementById('classSelectorTrigger').dataset.value;
    const filterCard = document.getElementById('filterCard');
    if (val) {
        filterCard.classList.remove('hidden');
        loadReport();
    } else {
        filterCard.classList.add('hidden');
        document.getElementById('reportContent').innerHTML = "<p style='text-align:center; color:#999; padding:40px;'>Please select a class to view records.</p>";
    }
}

function switchTab(tab, el) {
    currentReportTab = tab;
    document.querySelectorAll('.tab-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');

    const area = document.getElementById('dynamicDateFilter');
    area.innerHTML = "";
    const today = new Date().toISOString().split('T')[0];

    if (tab === 'day') {
        area.innerHTML = `<input type="date" id="repDate" value="${today}" data-date="${today}" onchange="this.setAttribute('data-date', this.value); loadReport()" style="width: 100%;">`;
    } else if (tab === 'month') {
        const mVal = today.substring(0,7);
        area.innerHTML = `<input type="month" id="repMonth" value="${mVal}" data-date="${mVal}" onchange="this.setAttribute('data-date', this.value); loadReport()" style="width: 100%;">`;
    } else {
        const first = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        area.innerHTML = `
            <div style="width: 100%;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;">
                    <input type="date" id="repFrom" value="${first}" data-date="${first}" onchange="handleDateRangeChange('repFrom', 'repTo', loadReport)" style="flex: 1; margin: 0; margin-bottom: 5px !important">
                    <span style="font-weight: bold; color: #888; font-size: 14px;">To</span>
                    <input type="date" id="repTo" value="${today}" data-date="${today}" onchange="handleDateRangeChange('repFrom', 'repTo', loadReport)" style="flex: 1; margin: 0; margin-bottom: 5px !important">
                </div>
                <div id="dateRangeError" class="hidden" style="color: var(--danger); font-size: 11px; font-weight: bold; text-align: center; margin-top: -5px; margin-bottom: 5px;">Invalid date select</div>
            </div>`;
    }
    loadReport();
}

function loadReport() {
    const area = document.getElementById('reportContent');
    if (!facultyData) return area.innerHTML = "<p style='text-align:center; color:#999; padding:20px;'>No data. Sync first.</p>";

    const cls = document.getElementById('classSelectorTrigger').dataset.value;
    if (!cls) {
        area.innerHTML = "<p style='text-align:center; color:#999; padding:40px;'>Please select a class to view records.</p>";
        return;
    }

    if (currentReportTab === 'day') renderDay(cls);
    else if (currentReportTab === 'month') renderMonth(cls);
    else renderSummary(cls);
}

function toggleSort() { sortState = (sortState + 1) % 3; loadReport(); }

function toggleDropdown(el) {
    const popup = document.getElementById('classDropdownPopup');
    const overlay = document.getElementById('dropdownOverlay');
    const rect = el.getBoundingClientRect();

    popup.style.top = (rect.bottom + 5) + 'px';
    popup.style.left = rect.left + 'px';
    popup.style.width = rect.width + 'px';

    overlay.style.display = 'block';

    const arrow = document.getElementById('dropdownArrow');
    if (arrow) arrow.classList.add('rotate-up');
}

function closeDropdown() {
    document.getElementById('dropdownOverlay').style.display = 'none';

    const arrow = document.getElementById('dropdownArrow');
    if (arrow) arrow.classList.remove('rotate-up');
}

function selectClass(className) {
    const trigger = document.getElementById('classSelectorTrigger');
    trigger.querySelector('span').innerText = className;
    trigger.dataset.value = className;
    closeDropdown();
    onClassSelected();
}

function renderDay(c) {
    const d = document.getElementById('repDate').value;
    const classData = facultyData.classes ? facultyData.classes[c] : null;
    if (!classData || !classData.attendance) return document.getElementById('reportContent').innerHTML = "<p style='text-align:center; color:#999;'>No records.</p>";

    const att = Object.values(classData.attendance).filter(a => a.date === d);
    if (att.length === 0) return document.getElementById('reportContent').innerHTML = "<p style='text-align:center; color:#999;'>No records for this date.</p>";

    att.sort((a,b) => parseInt(a.rollNo) - parseInt(b.rollNo));

    let h = `<div class="table-container"><table><tr><th style="text-align:center;">Roll No</th><th style="text-align:left">Name</th><th style="text-align:center;">Status</th></tr>`;

    att.forEach(a => {
        const isP = a.status === 'Present' || a.isPresent === true;
        h += `<tr><td style="text-align:center;">${a.rollNo}</td><td style="text-align:left">${a.studentName || '-'}</td><td style="color:${isP?'var(--success)':'var(--danger)'}; text-align:center;">${isP?'P':'A'}</td></tr>`;
    });
    document.getElementById('reportContent').innerHTML = h + "</table></div>";
}

function renderMonth(c) {
    const mv = document.getElementById('repMonth').value, [y, m] = mv.split('-').map(Number);
    const classData = facultyData.classes ? facultyData.classes[c] : null;

    if (!classData || !classData.students) return document.getElementById('reportContent').innerHTML = "<p style='text-align:center; color:#999;'>No student list.</p>";

    const ss = Object.values(classData.students);
    const att = Object.values(classData.attendance || {}).filter(a => a.date.startsWith(mv));

    const dim = new Date(y, m, 0).getDate(), am = {};

    att.forEach(a => {
        const d = parseInt(a.date.split('-')[2]);
        if (!am[a.rollNo]) am[a.rollNo] = {};
        am[a.rollNo][d] = (a.status === 'Present' || a.isPresent === true) ? 'P' : 'A';
    });

    let h = `<div class="table-container"><table><tr><th class="sticky-col" style="min-width: 65px; text-align:center;">Roll No</th><th style="text-align:left; min-width: 130px; white-space: nowrap;">Name</th>`;

    for (let d = 1; d <= dim; d++) h += `<th style="text-align:center;">${d}</th>`;
    h += `</tr>`;

    ss.sort((a,b) => parseInt(a.rollNo) - parseInt(b.rollNo)).forEach(s => {
        h += `<tr><td class="sticky-col" style="text-align:center;">${s.rollNo}</td><td style="text-align:left; white-space: nowrap;">${s.name}</td>`;
        for (let d = 1; d <= dim; d++) {
            const st = am[s.rollNo]?.[d] || "";
            h += `<td style="color:${st==='P'?'var(--success)':'var(--danger)'}; text-align:center;">${st}</td>`;
        }
        h += `</tr>`;
    });

    document.getElementById('reportContent').innerHTML = h + "</table></div>";
}

function renderSummary(c) {
    const fr = document.getElementById('repFrom').value, to = document.getElementById('repTo').value;
    const area = document.getElementById('reportContent');

    if (fr > to) {
        area.innerHTML = "<p style='text-align:center; color:var(--danger); padding:40px; font-weight:bold;'>Invalid date select</p>";
        return;
    }

    const classData = facultyData.classes ? facultyData.classes[c] : null;

    if (!classData || !classData.students) return document.getElementById('reportContent').innerHTML = "<p style='text-align:center; color:#999;'>No student list.</p>";

    const ss = Object.values(classData.students);
    const att = Object.values(classData.attendance || {}).filter(a => a.date >= fr && a.date <= to);

    const list = ss.map(s => { const r = att.filter(a => a.rollNo === s.rollNo), p = r.filter(a => a.status === 'Present' || a.isPresent === true).length; return { roll: s.rollNo, name: s.name, pct: r.length > 0 ? Math.round((p/r.length)*100) : 0 }; });
    if (sortState === 1) list.sort((a,b) => b.pct - a.pct); else if (sortState === 2) list.sort((a,b) => a.pct - b.pct); else list.sort((a,b) => parseInt(a.roll) - parseInt(b.roll));
    let si = sortState === 1 ? '<path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>' : (sortState === 2 ? '<path d="M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z"/>' : '<path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/>');
    let st = sortState === 1 ? 'Highest %' : (sortState === 2 ? 'Lowest %' : 'Roll No');
    let h = `<div style="margin-bottom:10px;"><button class="outline" style="width:auto; padding:8px 12px; font-size:12px; display:flex; align-items:center; gap:5px;" onclick="toggleSort()"><svg class="material-icons" style="font-size:16px" viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em">${si}</svg>Sort: ${st}</button></div>`;

    h += `<div class="table-container"><table><tr><th style="text-align:center;">Roll No</th><th style="text-align:left">Name</th><th style="text-align:center;">%</th></tr>`;

    list.forEach(r => {
        let col = r.pct > 75 ? 'var(--success)' : (r.pct < 41 ? 'var(--danger)' : 'var(--warning)');
        h += `<tr><td style="text-align:center;">${r.roll}</td><td style="text-align:left">${r.name}</td><td style="color:${col}; text-align:center;">${r.pct}%</td></tr>`;
    });
    document.getElementById('reportContent').innerHTML = h + "</table></div>";
}


function setupOverallSummary() {
    const l = document.getElementById('overallClassList'), today = new Date().toISOString().split('T')[0];
    l.innerHTML = "";

    const genBtn = document.getElementById('generateTableBtn');
    if (genBtn) genBtn.classList.add('hidden');

    const fDate = document.getElementById('overallFromDate');
    if (fDate) {
        fDate.value = today.substring(0,8) + "01";
        fDate.setAttribute('data-date', fDate.value);
        fDate.onchange = function() {
            handleDateRangeChange('overallFromDate', 'overallToDate', () => {
                if (!document.getElementById('frag_overall_view').classList.contains('hidden')) generateOverallSummary();
            });
        };
    }

    const tDate = document.getElementById('overallToDate');
    if (tDate) {
        tDate.value = today;
        tDate.setAttribute('data-date', tDate.value);
        tDate.onchange = function() {
            handleDateRangeChange('overallFromDate', 'overallToDate', () => {
                if (!document.getElementById('frag_overall_view').classList.contains('hidden')) generateOverallSummary();
            });
        };
    }

    let allAvailableClasses = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(`attnd_data_${currentPrincipalId}_`)) {
            const d = JSON.parse(localStorage.getItem(k));
            if (d.classes) {
                Object.entries(d.classes).forEach(([className, classData]) => {
                    allAvailableClasses.push({
                        className: className,
                        subject: classData.subject || 'Unknown',
                        teacherName: d.teacherName || 'Teacher',
                        teacherId: d.teacherId || k.replace(`attnd_data_${currentPrincipalId}_`, ""),
                        storageKey: k
                    });
                });
            }
        }
    }

    if (allAvailableClasses.length === 0) {
        l.innerHTML = "<p style='text-align:center; color:#999; padding:20px;'>No synced data.</p>";
    } else {
        // Sort by Subject first, then by Class Name
        allAvailableClasses.sort((a, b) => {
            const subA = a.subject.toLowerCase();
            const subB = b.subject.toLowerCase();
            if (subA < subB) return -1;
            if (subA > subB) return 1;

            const clsA = a.className.toLowerCase();
            const clsB = b.className.toLowerCase();
            if (clsA < clsB) return -1;
            if (clsA > clsB) return 1;
            return 0;
        });

        allAvailableClasses.forEach(item => {
            const div = document.createElement('div');
            div.style.display = "flex";
            div.style.alignItems = "center";

            div.innerHTML = `
                <div style="padding: 0 15px 0 5px;">
                    <input type="checkbox" name="os" value="${item.className}" data-tid="${item.teacherId}" data-subject="${item.subject}" onchange="checkSelectionCount()" style="width:22px; height:22px; margin: 0;">
                </div>

                <div style="flex: 1; padding: 12px 0; border-bottom: 1.5px solid #f2f2f2; display: flex; flex-direction: column; gap: 2px;">
                    <div style="font-size: 16px; font-weight: 500; color: var(--text-primary);">${item.className}</div>
                    <div style="font-size: 13px; color: #888; font-weight: normal;">${item.subject} - ${item.teacherName}</div>
                </div>
            `;
            l.appendChild(div);
        });
    }
}

function generateOverallSummary() {
    const fr = document.getElementById('overallFromDate').value,
          to = document.getElementById('overallToDate').value,
          sel = Array.from(document.querySelectorAll('input[name="os"]:checked'));

    if (fr > to) return showAlertDialog("Error", "Invalid date select");
    if (sel.length === 0) return showAlertDialog("Notice", "Please select classes");

    let referenceMap = null; // Map: RollNo -> NormalizedName
    for (let i = 0; i < sel.length; i++) {
        const d = JSON.parse(localStorage.getItem(`attnd_data_${currentPrincipalId}_${sel[i].dataset.tid}`));
        const classData = d.classes ? d.classes[sel[i].value] : null;
        if (!classData || !classData.students) return showAlertDialog("Error", "Missing data for " + sel[i].value);

        const students = Object.values(classData.students);
        const currentMap = {};
        students.forEach(s => {
            currentMap[String(s.rollNo).trim()] = normalizeStudentName(s.name);
        });

        if (i === 0) {
            referenceMap = currentMap;
        } else {
            const refKeys = Object.keys(referenceMap);
            const curKeys = Object.keys(currentMap);
            let isMismatch = refKeys.length !== curKeys.length;

            if (!isMismatch) {
                for (let roll of refKeys) {
                    if (!areNamesCompatible(referenceMap[roll], currentMap[roll])) {
                        isMismatch = true;
                        break;
                    }
                }
            }

            if (isMismatch) {
                return showAlertDialog("Mismatch Error", "Student mismatch across classes (Roll No or Name).");
            }
        }
    }

    const f = sel[0], fd = JSON.parse(localStorage.getItem(`attnd_data_${currentPrincipalId}_${f.dataset.tid}`));
    const baseClassData = fd.classes ? fd.classes[f.value] : null;
    const base = Object.values(baseClassData.students);

    let h = `<table><tr><th class="sticky-col" style="min-width: 65px;">Roll No</th><th style="text-align:left; min-width: 130px; white-space: nowrap;">Name</th>`;
    sel.forEach(s => h += `<th>${s.dataset.subject || s.value}</th>`);
    h += `</tr>`;

    base.sort((a,b) => parseInt(a.rollNo) - parseInt(b.rollNo)).forEach(bs => {
        let hasLowAttendance = false;
        let rowsHtml = "";

        sel.forEach(s => {
            const d = JSON.parse(localStorage.getItem(`attnd_data_${currentPrincipalId}_${s.dataset.tid}`));
            const classData = d.classes ? d.classes[s.value] : null;
            const att = classData ? Object.values(classData.attendance || {}).filter(a => a.rollNo === bs.rollNo && a.date >= fr && a.date <= to) : [];
            const p = att.filter(a => a.status === 'Present' || a.isPresent === true).length;
            let pctStr = "-";
            let colColor = "#999";

            if (att.length > 0) {
                const pct = Math.round((p/att.length)*100);
                pctStr = pct + "%";
                if (pct <= 40) { colColor = "#D32F2F"; hasLowAttendance = true; }
                else if (pct <= 70) { colColor = "#F57C00"; }
                else { colColor = "#388E3C"; }
            }
            rowsHtml += `<td style="color:${colColor}; font-weight:bold; text-align:center;">${pctStr}</td>`;
        });

        let rollDisplay = bs.rollNo;
        if (hasLowAttendance) {
            rollDisplay = `<span class="dot dot-red"></span>${bs.rollNo}`;
        }

        h += `<tr><td class="sticky-col" style="text-align:center;">${rollDisplay}</td><td style="text-align:left; white-space: nowrap;">${bs.name}</td>` + rowsHtml + `</tr>`;
    });
    document.getElementById('overallResultContent').innerHTML = h + "</table>";
    requestNavigate('overall_view');
}

function closeExportDialog() {
    document.getElementById('exportDialogOverlay').classList.add('hidden');
}

function openExportDialog() {
    isOverallExport = false;
    const cls = document.getElementById('classSelectorTrigger').dataset.value;
    if (!cls) return showAlertDialog("Notice", "Please select a class first");

    let defaultName = cls;
    if (currentReportTab === 'day') {
        const d = document.getElementById('repDate').value;
        const dateObj = new Date(d);
        const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const dateStr = dateObj.getDate() + months[dateObj.getMonth()];
        defaultName += "_" + dateStr;
    } else if (currentReportTab === 'month') {
        const mv = document.getElementById('repMonth').value;
        const [y, m] = mv.split('-');
        defaultName += "_" + parseInt(m) + "_" + y;
    } else {
        defaultName += "_Summary";
    }

    document.getElementById('exportFilename').value = defaultName;
    document.getElementById('exportDialogOverlay').classList.remove('hidden');
}

function openOverallExportDialog() {
    isOverallExport = true;
    const sel = Array.from(document.querySelectorAll('input[name="os"]:checked'));
    if (sel.length === 0) return showAlertDialog("Notice", "Please generate summary first.");

    const className = sel[0].value;
    document.getElementById('exportFilename').value = className + "_OverAll";
    document.getElementById('exportDialogOverlay').classList.remove('hidden');
}

async function handleExport() {
    const filename = document.getElementById('exportFilename').value.trim();
    if (!filename) return showAlertDialog("Notice", "Filename cannot be empty");

    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    const fullFileName = filename + (format === 'pdf' ? '.pdf' : '.xls');

    // Native Interface se check karein ki file pehle se hai ya nahi
    if (typeof AndroidDownloader !== 'undefined' && AndroidDownloader.fileExists) {
        if (AndroidDownloader.fileExists(fullFileName)) {
            closeExportDialog();
            showCustomDialog(
                "Overwrite File?",
                `A file named "${fullFileName}" already exists in ATTND_Insight folder. Do you want to overwrite it?`,
                () => {
                    closeCustomDialog();
                    executeExport(filename, format);
                },
                false,
                "OVERWRITE"
            );
            return;
        }
    }

    executeExport(filename, format);
    closeExportDialog();
}

async function executeExport(filename, format) {
    if (isOverallExport) {
        if (format === 'pdf') {
            await exportOverallSummaryToPdf(filename);
        } else {
            exportOverallSummaryToExcel(filename);
        }
    } else {
        const cls = document.getElementById('classSelectorTrigger').dataset.value;
        if (format === 'pdf') {
            await exportToPdf(filename, cls);
        } else {
            exportToExcel(filename, cls);
        }
    }
}

// --- OVERALL SUMMARY PDF EXPORT LOGIC ---
async function exportOverallSummaryToPdf(filename) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'pt', 'a4');

    const fr = document.getElementById('overallFromDate').value;
    const to = document.getElementById('overallToDate').value;
    const sel = Array.from(document.querySelectorAll('input[name="os"]:checked'));

    const f = sel[0];
    const className = f.value;

    const fd = JSON.parse(localStorage.getItem(`attnd_data_${currentPrincipalId}_${f.dataset.tid}`));
    const baseClassData = fd.classes ? fd.classes[className] : null;
    const base = Object.values(baseClassData.students);
    base.sort((a,b) => parseInt(a.rollNo) - parseInt(b.rollNo));

    const subjectHeaders = sel.map(s => s.dataset.subject || s.value);
    const classKeys = sel.map(s => s.value);
    const allStudents = [];
    const defaulters = [];

    base.forEach(bs => {
        const rowData = { rollNo: bs.rollNo, name: bs.name, attendanceData: {} };
        let allLow = true;
        let hasData = false;
        let anyLow = false;

        sel.forEach(s => {
            const d = JSON.parse(localStorage.getItem(`attnd_data_${currentPrincipalId}_${s.dataset.tid}`));
            const classData = d.classes ? d.classes[s.value] : null;
            const att = classData ? Object.values(classData.attendance || {}).filter(a => a.rollNo === bs.rollNo && a.date >= fr && a.date <= to) : [];
            const p = att.filter(a => a.status === 'Present' || a.isPresent === true).length;
            let pctStr = "-";

            if (att.length > 0) {
                const pct = Math.round((p/att.length)*100);
                pctStr = pct + "%";
                hasData = true;
                if (pct < 41) anyLow = true;
                if (pct >= 41) allLow = false;
            } else {
                allLow = false;
            }
            rowData.attendanceData[s.value] = pctStr;
        });

        rowData.anyLow = anyLow;
        allStudents.push(rowData);
        if (hasData && allLow) defaulters.push(rowData);
    });

    const startY = await drawOverallPdfBrandingAndHeader(doc, className, fr, to);
    drawOverallTable(doc, startY, allStudents, subjectHeaders, classKeys);

    if (defaulters.length > 0) {
        doc.addPage();
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(211, 47, 47);
        doc.text("Defaulter Summary (<= 40% in ALL subjects)", 30, 40);
        drawOverallTable(doc, 65, defaulters, subjectHeaders, classKeys);
    }

    if (typeof AndroidDownloader !== 'undefined') {
        const base64data = doc.output('datauristring');
        AndroidDownloader.saveBase64File(base64data, 'application/pdf', filename + '.pdf');
    } else {
        doc.save(filename + '.pdf');
    }
}

async function drawOverallPdfBrandingAndHeader(doc, className, fr, to) {
    const rightEdge = 812;
    const y = 30;

    try {
        const logoBase64 = await getBase64Image('attnd.png');

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        const brandTextWidth = doc.getTextWidth("ATTND");

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const subTextWidth = doc.getTextWidth("By Nirbhay D. & Parth K.");

        const maxTextWidth = Math.max(brandTextWidth, subTextWidth);
        const brandX = rightEdge - maxTextWidth;
        const subTextX = rightEdge - maxTextWidth;

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text("ATTND", brandX, y + 12);

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("By Nirbhay D. & Parth K.", subTextX, y + 24);

        const lineX = brandX - 10;
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(1.5);
        doc.line(lineX, y - 5, lineX, y + 25);

        const logoX = lineX - 10 - 32;
        doc.addImage(logoBase64, 'PNG', logoX, y - 5, 32, 32);
    } catch (e) { console.error("Overall Branding error", e); }

    doc.setTextColor(0, 0, 0);
    const startX = 30;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Overall Attendance Summary Report", startX, y + 10);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text("Class: " + className, startX, y + 30);
    doc.text("Period: " + fr + " to " + to, startX, y + 45);

    doc.setDrawColor(224, 224, 224);
    doc.setLineWidth(1);
    doc.line(startX, y + 60, rightEdge, y + 60);

    return y + 75;
}

function drawOverallTable(doc, startY, students, displayHeaders, dataKeys) {
    const body = students.map(s => {
        const row = [s.rollNo, s.name];
        dataKeys.forEach(k => row.push(s.attendanceData[k]));
        row.anyLow = s.anyLow;
        return row;
    });

    const head = [['Roll', 'Student Name', ...displayHeaders]];

    doc.autoTable({
        startY: startY,
        head: head,
        body: body,
        theme: 'plain',
        headStyles: {
            fillColor: [12, 86, 205],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'center'
        },
        bodyStyles: {
            fontSize: 9,
            textColor: [0, 0, 0]
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { lineColor: [238, 238, 238], lineWidth: 0.5, cellPadding: 4, halign: 'center' },
        columnStyles: {
            0: { cellWidth: 45, halign: 'center' },
            1: { cellWidth: 190, halign: 'left' }
        },
        didParseCell: function(data) {
            if (data.section === 'head' && data.column.index === 1) {
                data.cell.styles.halign = 'left';
            }
            if (data.section === 'body' && data.column.index >= 2) {
                const val = data.cell.raw;
                if (val !== 'N/A' && val !== '-') {
                    const pct = parseFloat(val.replace('%','').trim());
                    if (!isNaN(pct)) {
                        data.cell.styles.fontStyle = 'bold';
                        if (pct <= 40) data.cell.styles.textColor = [211, 47, 47];
                        else if (pct <= 70) data.cell.styles.textColor = [245, 124, 0];
                        else data.cell.styles.textColor = [56, 142, 60];
                    }
                } else {
                    data.cell.styles.textColor = [128, 128, 128];
                }
            }
        },
        didDrawCell: function(data) {
            if (data.section === 'body' && data.column.index === 0) {
                const rowData = data.row.raw;
                if (rowData.anyLow) {
                    const cx = data.cell.x + 8;
                    const cy = data.cell.y + data.cell.height / 2;
                    doc.setFillColor(255, 0, 0);
                    doc.circle(cx, cy, 2, 'F');
                }
            }
        },
        didDrawPage: function(data) {
            const bottomY = 595 - 25;
            doc.setDrawColor(224, 224, 224);
            doc.setLineWidth(1);
            doc.line(30, bottomY - 10, 812, bottomY - 10);

            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(128, 128, 128);

            doc.text("Generated by ATTND", 30, bottomY);
            doc.text("Developed by Nirbhay D. & Parth K.", 421, bottomY, { align: 'center' });
            doc.text("Page " + doc.internal.getNumberOfPages(), 812, bottomY, { align: 'right' });
        }
    });
}

// --- OVERALL SUMMARY EXCEL EXPORT LOGIC ---
function exportOverallSummaryToExcel(filename) {
    const fr = document.getElementById('overallFromDate').value;
    const to = document.getElementById('overallToDate').value;
    const sel = Array.from(document.querySelectorAll('input[name="os"]:checked'));

    const f = sel[0];
    const className = f.value;

    const fd = JSON.parse(localStorage.getItem(`attnd_data_${currentPrincipalId}_${f.dataset.tid}`));
    const baseClassData = fd.classes ? fd.classes[className] : null;
    const base = Object.values(baseClassData.students);
    base.sort((a,b) => parseInt(a.rollNo) - parseInt(b.rollNo));

    const subjectHeaders = sel.map(s => s.dataset.subject || s.value);
    const allStudents = [];
    const defaulters = [];

    base.forEach(bs => {
        const rowData = [bs.rollNo, bs.name];
        let allLow = true;
        let hasData = false;

        sel.forEach(s => {
            const d = JSON.parse(localStorage.getItem(`attnd_data_${currentPrincipalId}_${s.dataset.tid}`));
            const classData = d.classes ? d.classes[s.value] : null;
            const att = classData ? Object.values(classData.attendance || {}).filter(a => a.rollNo === bs.rollNo && a.date >= fr && a.date <= to) : [];
            const p = att.filter(a => a.status === 'Present' || a.isPresent === true).length;
            let pctStr = "-";

            if (att.length > 0) {
                const pct = Math.round((p/att.length)*100);
                pctStr = pct + "%";
                hasData = true;
                if (pct >= 41) allLow = false;
            } else {
                allLow = false;
            }
            rowData.push(pctStr);
        });

        allStudents.push(rowData);
        if (hasData && allLow) defaulters.push(rowData);
    });

    let data = [];
    data.push([`All Students Summary (${fr} to ${to})`]);
    data.push(["Roll No", "Student Name", ...subjectHeaders]);
    data = data.concat(allStudents);

    if (defaulters.length > 0) {
        data.push([]);
        data.push(["Defaulter Students (<= 40% in ALL subjects)"]);
        data.push(["Roll No", "Student Name", ...subjectHeaders]);
        data = data.concat(defaulters);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Overall Summary");

    if (typeof AndroidDownloader !== 'undefined') {
        const base64data = XLSX.write(wb, { bookType: 'xls', type: 'base64' });
        AndroidDownloader.saveBase64File("data:application/vnd.ms-excel;base64," + base64data, "application/vnd.ms-excel", filename + ".xls");
    } else {
        XLSX.writeFile(wb, filename + ".xls");
    }
}

// --- Regular Class Reports Export ---
async function exportToPdf(filename, cls) {
    const { jsPDF } = window.jspdf;
    const orientation = currentReportTab === 'month' ? 'l' : 'p';
    const doc = new jsPDF(orientation, 'pt', 'a4');

    await addPdfBranding(doc, orientation === 'l' ? 842 : 595);

    const classData = facultyData.classes ? facultyData.classes[cls] : null;
    if (!classData) return showAlertDialog("Error", "No data for this class");

    if (currentReportTab === 'day') {
        const d = document.getElementById('repDate').value;
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(`Daily Attendance Report: ${d}`, 40, 50);
        doc.text(`Class: ${cls} (${classData.subject || ''})`, 40, 80);

        const att = Object.values(classData.attendance || {}).filter(a => a.date === d);
        att.sort((a,b) => parseInt(a.rollNo) - parseInt(b.rollNo));

        const body = att.map(a => [
            a.rollNo,
            a.studentName || '-',
            (a.status === 'Present' || a.isPresent === true) ? 'Present' : 'Absent'
        ]);

        doc.autoTable({
            startY: 110,
            head: [['Roll No', 'Name', 'Status']],
            body: body,
            headStyles: { fillColor: [230, 237, 255], textColor: [12, 86, 205], fontStyle: 'bold', halign: 'center' },
            styles: { halign: 'center' },
            columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'left' }, 2: { cellWidth: 100 } },
            didParseCell: function(data) {
                if (data.section === 'head' && data.column.index === 1) {
                    data.cell.styles.halign = 'left';
                }
                if (data.section === 'body' && data.column.index === 2) {
                    if (data.cell.raw === 'Present') data.cell.styles.textColor = [56, 142, 60];
                    else data.cell.styles.textColor = [255, 0, 0];
                }
            }
        });
    } else if (currentReportTab === 'month') {
        const mv = document.getElementById('repMonth').value, [y, m] = mv.split('-').map(Number);
        const monthName = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' });

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(`Class Name: ${cls} (${classData.subject || ''})`, 40, 30);
        doc.text(`${monthName} ${y}`, 40, 50);

        const ss = Object.values(classData.students || {});
        const att = Object.values(classData.attendance || {}).filter(a => a.date.startsWith(mv));
        const dim = new Date(y, m, 0).getDate();
        const am = {};
        att.forEach(a => { const d = parseInt(a.date.split('-')[2]); if (!am[a.rollNo]) am[a.rollNo] = {}; am[a.rollNo][d] = (a.status === 'Present' || a.isPresent === true) ? 'P' : 'A'; });

        const head = [['Roll', 'Name', ...Array.from({length: dim}, (_, i) => i + 1)]];
        const body = ss.sort((a,b) => parseInt(a.rollNo) - parseInt(b.rollNo)).map(s => {
            const row = [s.rollNo, s.name];
            for (let d = 1; d <= dim; d++) row.push(am[s.rollNo]?.[d] || '');
            return row;
        });

        doc.autoTable({
            startY: 70,
            head: head,
            body: body,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 2, halign: 'center' },
            headStyles: { fillColor: [230, 237, 255], textColor: [12, 86, 205], fontStyle: 'bold', halign: 'center' },
            columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 'auto', halign: 'left' } },
            didParseCell: function(data) {
                if (data.section === 'head' && data.column.index === 1) {
                    data.cell.styles.halign = 'left';
                }
                if (data.section === 'body' && data.column.index >= 2) {
                    if (data.cell.raw === 'P') data.cell.styles.textColor = [0, 100, 0];
                    else if (data.cell.raw === 'A') data.cell.styles.textColor = [255, 0, 0];
                }
            }
        });
    } else {
        const fr = document.getElementById('repFrom').value, to = document.getElementById('repTo').value;
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text(`Attendance Summary: ${cls} (${classData.subject || ''})`, 50, 50);
        doc.setFontSize(14);
        doc.setFont("helvetica", "normal");
        doc.text(`From: ${fr} To: ${to}`, 50, 75);

        const ss = Object.values(classData.students || {});
        const att = Object.values(classData.attendance || {}).filter(a => a.date >= fr && a.date <= to);

        const list = ss.map(s => {
            const r = att.filter(a => a.rollNo === s.rollNo), p = r.filter(a => (a.status === 'Present' || a.isPresent === true)).length;
            return { roll: s.rollNo, name: s.name, total: r.length, present: p, pct: r.length > 0 ? Math.round((p/r.length)*100) : 0 };
        });

        if (sortState === 1) list.sort((a,b) => b.pct - a.pct);
        else if (sortState === 2) list.sort((a,b) => a.pct - b.pct);
        else list.sort((a,b) => parseInt(a.roll) - parseInt(b.roll));

        doc.autoTable({
            startY: 115,
            head: [['Roll', 'Name', 'Present', 'Absent', '%']],
            body: list.map(s => [s.roll, s.name, s.present, s.total - s.present, s.pct + '%']),
            headStyles: { fillColor: [230, 237, 255], textColor: [12, 86, 205], fontStyle: 'bold', halign: 'center' },
            styles: { fontSize: 12, cellPadding: 5, halign: 'center' },
            columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 220, halign: 'left' }, 2: { cellWidth: 60 }, 3: { cellWidth: 100 }, 4: { cellWidth: 60 } },
            didParseCell: function(data) {
                if (data.section === 'head' && data.column.index === 1) {
                    data.cell.styles.halign = 'left';
                }
                if (data.section === 'body' && data.column.index === 4) {
                    const pctVal = parseInt(data.cell.raw);
                    if (pctVal >= 75) data.cell.styles.textColor = [56, 142, 60];
                    else if (pctVal >= 50) data.cell.styles.textColor = [245, 124, 0];
                    else data.cell.styles.textColor = [255, 0, 0];
                }
            }
        });
    }

   if (typeof AndroidDownloader !== 'undefined') {
        const base64data = doc.output('datauristring');
        AndroidDownloader.saveBase64File(base64data, 'application/pdf', filename + '.pdf');
    } else {
        doc.save(filename + '.pdf');
    }
}

async function addPdfBranding(doc, pageWidth) {
    try {
        const logoBase64 = await getBase64Image('attnd.png');
        const brandText = "ATTND";
        const subText = "By Nirbhay D. & Parth K.";

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        const brandWidth = doc.getTextWidth(brandText);

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const subWidth = doc.getTextWidth(subText);

        const maxW = Math.max(brandWidth, subWidth);
        const brandX = pageWidth - maxW - 20;
        const subX = pageWidth - maxW - 20;

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(brandText, brandX, 36);

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(subText, subX, 48);

        const lineX = pageWidth - maxW - 30;
        doc.setDrawColor(0, 0, 0, 80);
        doc.setLineWidth(1.5);
        doc.line(lineX, 15, lineX, 47);

        const logoX = lineX - 10 - 32;
        doc.addImage(logoBase64, 'PNG', logoX, 15, 32, 32);
    } catch (e) { console.error("Branding error", e); }
    doc.setTextColor(0, 0, 0);
}

function getBase64Image(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
    });
}

function exportToExcel(filename, cls) {
    let data = [];
    const classData = facultyData.classes ? facultyData.classes[cls] : null;
    if (!classData) return showAlertDialog("Error", "No data for this class");

    if (currentReportTab === 'day') {
        const d = document.getElementById('repDate').value;
        const att = Object.values(classData.attendance || {}).filter(a => a.date === d);
        att.sort((a,b) => parseInt(a.rollNo) - parseInt(b.rollNo));
        data = [[`Class: ${cls}`, `Subject: ${classData.subject || ''}`], ["Roll No", "Name", "Status"], ...att.map(a => [a.rollNo, a.studentName || '-', (a.status === 'Present' || a.isPresent === true) ? 'P' : 'A'])];
    } else if (currentReportTab === 'month') {
        const mv = document.getElementById('repMonth').value, [y, m] = mv.split('-').map(Number);
        const ss = Object.values(classData.students || {});
        const att = Object.values(classData.attendance || {}).filter(a => a.date.startsWith(mv));
        const dim = new Date(y, m, 0).getDate();
        const am = {};
        att.forEach(a => { const d = parseInt(a.date.split('-')[2]); if (!am[a.rollNo]) am[a.rollNo] = {}; am[a.rollNo][d] = (a.status === 'Present' || a.isPresent === true) ? 'P' : 'A'; });

        const header = ["Roll No", "Name", ...Array.from({length: dim}, (_, i) => i + 1), "Total P", "Total A"];
        const rows = ss.sort((a,b) => parseInt(a.rollNo) - parseInt(b.rollNo)).map(s => {
            let p = 0, a = 0;
            const row = [s.rollNo, s.name];
            for (let d = 1; d <= dim; d++) {
                const st = am[s.rollNo]?.[d] || '';
                row.push(st);
                if (st === 'P') p++; else if (st === 'A') a++;
            }
            row.push(p, a);
            return row;
        });
        data = [[`Class: ${cls}`, `Subject: ${classData.subject || ''}`], header, ...rows];
    } else {
        const fr = document.getElementById('repFrom').value, to = document.getElementById('repTo').value;
        const ss = Object.values(classData.students || {});
        const att = Object.values(classData.attendance || {}).filter(a => a.date >= fr && a.date <= to);
        const list = ss.map(s => {
            const r = att.filter(a => a.rollNo === s.rollNo), p = r.filter(a => (a.status === 'Present' || a.isPresent === true)).length;
            return { roll: s.rollNo, name: s.name, total: r.length, present: p, pct: r.length > 0 ? Math.round((p/r.length)*100) : 0 };
        });
        if (sortState === 1) list.sort((a,b) => b.pct - a.pct);
        else if (sortState === 2) list.sort((a,b) => a.pct - b.pct);
        else list.sort((a,b) => parseInt(a.roll) - parseInt(b.roll));

        data = [[`Class: ${cls}`, `Subject: ${classData.subject || ''}`], ["Roll No", "Name", " Present ", " Absent ", "Percentage"], ...list.map(s => [s.roll, s.name, s.present, s.total - s.present, s.pct + "%"])];
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");

    if (typeof AndroidDownloader !== 'undefined') {
        const base64data = XLSX.write(wb, { bookType: 'xls', type: 'base64' });
        AndroidDownloader.saveBase64File("data:application/vnd.ms-excel;base64," + base64data, "application/vnd.ms-excel", filename + ".xls");
    } else {
        XLSX.writeFile(wb, filename + ".xls");
    }
}
