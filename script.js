// script.js

const firebaseConfig = {
    apiKey: "AIzaSyBN5JeNOfgnGlvT65Hjv9WWoj4UMe4_WBM",
    authDomain: "medlssd.firebaseapp.com",
    databaseURL: "https://medlssd-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "medlssd",
    storageBucket: "medlssd.appspot.com",
    messagingSenderId: "1092371056062",
    appId: "1:1092371056062:web:73659ea06da778eea965ef"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

const ADD_MED_WEBHOOK = "https://discord.com/api/webhooks/1351552366389755915/kzeTOnAZY6YjNR-D7PdTEKUPTSGU3ruIR6x9i4xeEcPjy9fZ2I4jmGj6HWqYGvaIgd2m";
const EDIT_MED_WEBHOOK = "https://discord.com/api/webhooks/1351552366389755915/kzeTOnAZY6YjNR-D7PdTEKUPTSGU3ruIR6x9i4xeEcPjy9fZ2I4jmGj6HWqYGvaIgd2m";
const EXPIRED_MED_WEBHOOK = "https://discord.com/api/webhooks/1451651014016106730/2L1bGf2d1qJdXFNEkRMXA4-JzLoZngD-zLwkISuaD-9U6Y3BWHxrSdfBdvG4YEgr9WD8";
const REG_WEBHOOK = "https://discord.com/api/webhooks/1450792489131966465/VOoJfUCC67a2Eer9ckNq7Z7TTLucX4eeezT1Lk1njrr8m6_HkMDlthKNB_RaZLllFfAX";

let currentUserUid = null;
let currentUserName = null;
let currentUserRole = null;
let medCardsData = [];
let sortDirection = 'desc';

function formatDate(yyyyMmDd) {
    if (!yyyyMmDd) return '';
    const parts = yyyyMmDd.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function getDaysLeft(expiry) {
    const today = new Date();
    const expDate = new Date(expiry);
    const timeDiff = expDate - today;
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
}

async function sendExpiryNotification(name, passport, expiry, daysLeft, isUpdate = false) {
    const bossTag = '<@781121505219969024>';
    const formattedExpiry = formatDate(expiry);
    let message = '';
    let webhook = EXPIRED_MED_WEBHOOK;
    if (isUpdate) {
        message = `${bossTag} Медкарта обновлена для ${name} (${passport}). Новый срок: ${formattedExpiry}`;
        webhook = EDIT_MED_WEBHOOK;
    } else if (daysLeft <= 0) {
        message = `${bossTag} ${name} (${passport}), медкарта просрочена. Нужно обновить и предоставить новую`;
    } else if (daysLeft === 1 || daysLeft === 2) {
        message = `${bossTag} ${name} (${passport}), через ${daysLeft} день${daysLeft > 1 ? 'а' : ''} закончится медкарта и ее нужно обновить и предоставить новую`;
    }
    if (message) {
        await sendToDiscord(webhook, message);
    }
}

function showGuestView() {
    document.getElementById('guest-view').style.display = 'block';
    document.getElementById('auth').style.display = 'none';
    document.getElementById('dashboard').style.display = 'none';
    loadMedCardsGuest();
}

function showAuth() {
    document.getElementById('guest-view').style.display = 'none';
    document.getElementById('auth').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
    showLogin();
}

function showLogin() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-error').innerText = '';
}

function showRegister() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('reg-error').innerText = '';
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';

    if (tabId === 'medcards-tab') loadMedCardsAdmin();
    if (tabId === 'history-tab') loadHistory();
    if (tabId === 'users-tab') loadUsers();
    if (tabId === 'mp-tab') initMP();
}

async function sendToDiscord(webhook, content) {
    try {
        await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content })
        });
    } catch (e) { console.error('Discord error:', e); }
}

async function logAction(type, details) {
    if (!currentUserUid) return;
    const log = {
        timestamp: new Date().toISOString(),
        userUid: currentUserUid,
        userName: currentUserName,
        type,
        details
    };
    try {
        await db.ref('logs').push(log);
    } catch (e) {
        console.error('Log error:', e);
    }
}

async function register() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const code = document.getElementById('reg-code').value.trim();

    if (!name || !email || password.length < 6) {
        document.getElementById('reg-error').innerText = "Заполните все поля корректно";
        return;
    }

    const role = (code === "BossAdmins") ? "admin" : (code === "Medlooking") ? "checker" : null;
    if (!role) {
        document.getElementById('reg-error').innerText = "Неверный код роли";
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        await db.ref('users/' + user.uid).set({ name, email, role });

        sendToDiscord(REG_WEBHOOK, `**Новая регистрация**\nИмя: ${name}\nEmail: ${email}\nРоль: ${role}\nUID: ${user.uid}`);
        logAction('registration', `Новый пользователь: ${email}`);

        alert("Регистрация успешна! Теперь войдите.");
        showLogin();
    } catch (error) {
        let msg = error.message;
        if (error.code === 'auth/email-already-in-use') msg = "Email уже используется";
        document.getElementById('reg-error').innerText = msg;
        console.error(error);
    }
}

async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        document.getElementById('login-error').innerText = "Заполните поля";
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        let msg = "Неверный email или пароль";
        if (error.code === 'auth/invalid-email') msg = "Неверный email";
        document.getElementById('login-error').innerText = msg;
        console.error(error);
    }
}

async function logout() {
    try {
        await auth.signOut();
    } catch (e) {
        console.error('Logout error:', e);
    }
}

function toggleAddForm() {
    const form = document.getElementById('add-med-form');
    form.style.display = form.style.display === 'none' || form.style.display === '' ? 'grid' : 'none';
}

async function addMedCard() {
    if (!currentUserRole || (currentUserRole !== 'admin' && currentUserRole !== 'checker')) {
        document.getElementById('add-med-error').innerText = "Нет прав на добавление";
        return;
    }

    const name = document.getElementById('add-name').value.trim();
    const passport = document.getElementById('add-passport').value.trim();
    const expiry = document.getElementById('add-expiry').value;
    let photo = document.getElementById('add-photo').value.trim();

    if (!name || !passport || !expiry) {
        document.getElementById('add-med-error').innerText = "Заполните обязательные поля";
        return;
    }

    if (!/^\d+$/.test(passport)) {
        document.getElementById('add-med-error').innerText = "Паспорт должен содержать только цифры";
        return;
    }

    const year = expiry.split('-')[0];
    if (year.length !== 4 || year < '2000' || year > '2099') {
        document.getElementById('add-med-error').innerText = "Год должен состоять ровно из 4 цифр (между 2000 и 2099)";
        return;
    }

    if (isNaN(Date.parse(expiry))) {
        document.getElementById('add-med-error').innerText = "Неверная дата";
        return;
    }

    if (photo === '-') {
        photo = null;
    } else if (photo && !/^https?:\/\/.+/.test(photo)) {
        document.getElementById('add-med-error').innerText = "Неверный URL фото или используйте '-'";
        return;
    }

    const data = { name, passport, expiry, photo };
    try {
        const newRef = db.ref('medcards').push();
        await newRef.set(data);

        logAction('add_medcard', `Имя: ${name}, Паспорт: ${passport}, Срок: ${expiry}`);

        sendToDiscord(ADD_MED_WEBHOOK, `**Новая медкарта добавлена**\nИмя: ${name}\nПаспорт: ${passport}\nСрок: ${formatDate(expiry)}\nФото: ${photo || 'Нет'}`);

        const daysLeft = getDaysLeft(expiry);
        await sendExpiryNotification(name, passport, expiry, daysLeft);

        document.getElementById('add-name').value = '';
        document.getElementById('add-passport').value = '';
        document.getElementById('add-expiry').value = '';
        document.getElementById('add-photo').value = '';
        document.getElementById('add-med-error').innerText = '';
        toggleAddForm();

        loadMedCardsAdmin();
    } catch (e) {
        document.getElementById('add-med-error').innerText = 'Ошибка добавления: ' + e.message;
        console.error('Add medcard error:', e);
    }
}

function openEditMedCard(id, name, passport, expiry, photo) {
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-name').value = name;
    document.getElementById('edit-passport').value = passport;
    document.getElementById('edit-expiry').value = expiry;
    document.getElementById('edit-photo').value = photo || '-';
    document.getElementById('edit-med-modal').style.display = 'flex';
}

async function saveEditMedCard() {
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('edit-name').value.trim();
    const passport = document.getElementById('edit-passport').value.trim();
    const expiry = document.getElementById('edit-expiry').value;
    let photo = document.getElementById('edit-photo').value.trim();

    if (!name || !passport || !expiry) {
        document.getElementById('edit-med-error').innerText = "Заполните обязательные поля";
        return;
    }

    if (!/^\d+$/.test(passport)) {
        document.getElementById('edit-med-error').innerText = "Паспорт должен содержать только цифры";
        return;
    }

    const year = expiry.split('-')[0];
    if (year.length !== 4 || year < '2000' || year > '2099') {
        document.getElementById('edit-med-error').innerText = "Год должен состоять ровно из 4 цифр (между 2000 и 2099)";
        return;
    }

    if (isNaN(Date.parse(expiry))) {
        document.getElementById('edit-med-error').innerText = "Неверная дата";
        return;
    }

    if (photo === '-') {
        photo = null;
    } else if (photo && !/^https?:\/\/.+/.test(photo)) {
        document.getElementById('edit-med-error').innerText = "Неверный URL фото или используйте '-'";
        return;
    }

    const data = { name, passport, expiry, photo };
    try {
        await db.ref(`medcards/${id}`).update(data);

        logAction('edit_medcard', `Имя: ${name}, Паспорт: ${passport}, Срок: ${expiry}`);

        await sendExpiryNotification(name, passport, expiry, 0, true);

        const daysLeft = getDaysLeft(expiry);
        await sendExpiryNotification(name, passport, expiry, daysLeft);

        closeEditModal();
        loadMedCardsAdmin();
    } catch (e) {
        document.getElementById('edit-med-error').innerText = 'Ошибка сохранения: ' + e.message;
        console.error('Edit medcard error:', e);
    }
}

function closeEditModal() {
    document.getElementById('edit-med-modal').style.display = 'none';
    document.getElementById('edit-med-error').innerText = '';
}

async function deleteMedCard(id, name, passport) {
    if (!confirm(`Удалить медкарту: ${name} (${passport})?`)) return;

    try {
        await db.ref(`medcards/${id}`).remove();
        logAction('delete_medcard', `Имя: ${name}, Паспорт: ${passport}`);
        loadMedCardsAdmin();
    } catch (e) {
        console.error('Delete medcard error:', e);
    }
}

async function addNewUser() {
    if (currentUserRole !== 'admin') {
        document.getElementById('add-user-error').innerText = "Только админ может добавлять пользователей";
        return;
    }

    const name = document.getElementById('new-user-name').value.trim();
    const email = document.getElementById('new-user-email').value.trim();
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;

    if (!name || !email || password.length < 6) {
        document.getElementById('add-user-error').innerText = "Заполните все поля корректно";
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        await db.ref('users/' + user.uid).set({ name, email, role });

        sendToDiscord(REG_WEBHOOK, `**Новый пользователь добавлен админом**\nИмя: ${name}\nEmail: ${email}\nРоль: ${role}\nUID: ${user.uid}`);
        logAction('add_user', `Новый пользователь: ${email}, Роль: ${role}`);

        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-email').value = '';
        document.getElementById('new-user-password').value = '';
        document.getElementById('add-user-error').innerText = '';

        loadUsers();
    } catch (error) {
        let msg = error.message;
        if (error.code === 'auth/email-already-in-use') msg = "Email уже используется";
        document.getElementById('add-user-error').innerText = msg;
        console.error(error);
    }
}

function openEditUser(uid, name, email, role) {
    document.getElementById('edit-user-uid').value = uid;
    document.getElementById('edit-user-name').value = name;
    document.getElementById('edit-user-email').value = email;
    document.getElementById('edit-user-role').value = role;
    document.getElementById('edit-user-password').value = '';
    document.getElementById('edit-user-modal').style.display = 'flex';
}

async function saveEditUser() {
    const uid = document.getElementById('edit-user-uid').value;
    const name = document.getElementById('edit-user-name').value.trim();
    const email = document.getElementById('edit-user-email').value.trim();
    const password = document.getElementById('edit-user-password').value;
    const role = document.getElementById('edit-user-role').value;

    if (!name || !email) {
        document.getElementById('edit-user-error').innerText = "Заполните поля корректно";
        return;
    }

    const updates = { name, email, role };
    try {
        await db.ref(`users/${uid}`).update(updates);

        if (password && password.length >= 6) {
            console.warn('Смена пароля не реализована');
        }

        logAction('edit_user', `Пользователь: ${email}, Роль: ${role}`);

        closeEditUserModal();
        loadUsers();
    } catch (e) {
        document.getElementById('edit-user-error').innerText = 'Ошибка сохранения: ' + e.message;
        console.error('Edit user error:', e);
    }
}

function closeEditUserModal() {
    document.getElementById('edit-user-modal').style.display = 'none';
    document.getElementById('edit-user-error').innerText = '';
}

async function deleteUser(uid, email) {
    if (!confirm(`Удалить пользователя: ${email}?`)) return;

    try {
        await db.ref(`users/${uid}`).remove();
        logAction('delete_user', `Пользователь: ${email}`);
        loadUsers();
    } catch (e) {
        console.error('Delete user error:', e);
    }
}

async function loadMedCardsGuest() {
    const tbody = document.querySelector("#med-table-guest tbody");
    tbody.innerHTML = "<tr><td colspan='6'>Загрузка...</td></tr>";

    try {
        const snapshot = await db.ref("medcards").once("value");
        tbody.innerHTML = "";
        let i = 1;
        snapshot.forEach(child => {
            const d = child.val();
            const daysLeft = getDaysLeft(d.expiry);
            let status = 'Допущен';
            let statusClass = '';
            if (daysLeft <= 0) {
                status = 'Не допущен';
                statusClass = 'expired-text';
            }
            tbody.innerHTML += `
            <tr>
                <td>${i++}</td>
                <td>${d.name || ""}</td>
                <td>${d.passport || ""}</td>
                <td>${formatDate(d.expiry || "")}</td>
                <td class="${statusClass}">${status}</td>
                <td>${d.photo ? `<img src="${d.photo}" class="photo-preview" alt="Фото">` : "—"}</td>
            </tr>`;
        });
    } catch (e) {
        tbody.innerHTML = "<tr><td colspan='6'>Ошибка загрузки</td></tr>";
        console.error(e);
    }
}

function searchMedCardsGuest() {
    const filter = document.getElementById('med-search-guest').value.toLowerCase();
    document.querySelectorAll("#med-table-guest tbody tr").forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(filter) ? "" : "none";
    });
}

async function loadMedCardsAdmin() {
    try {
        const snapshot = await db.ref('medcards').once('value');
        medCardsData = [];
        snapshot.forEach(child => {
            const d = child.val();
            d.id = child.key;
            d.daysLeft = getDaysLeft(d.expiry);
            medCardsData.push(d);
        });
        sortMedCards(sortDirection);
        renderMedCardsAdmin();
    } catch (e) {
        console.error(e);
    }
}

function renderMedCardsAdmin() {
    const tbody = document.querySelector("#med-table-admin tbody");
    tbody.innerHTML = "";
    let i = 1;
    medCardsData.forEach(d => {
        let status = 'Допущен';
        let statusClass = '';
        if (d.daysLeft <= 0) {
            status = 'Не допущен';
            statusClass = 'expired-text';
        }
        const actions = currentUserRole === 'admin' || currentUserRole === 'checker' ? `
            <button class="cyber-btn small" onclick="openEditMedCard('${d.id}', '${d.name}', '${d.passport}', '${d.expiry}', '${d.photo || ''}')">Ред.</button>
            <button class="cyber-btn small danger" onclick="deleteMedCard('${d.id}', '${d.name}', '${d.passport}')">Удал.</button>
        ` : '';
        tbody.innerHTML += `
        <tr>
            <td>${i++}</td>
            <td>${d.name || ""}</td>
            <td>${d.passport || ""}</td>
            <td>${formatDate(d.expiry || "")}</td>
            <td class="${statusClass}">${status}</td>
            <td>${d.photo ? `<img src="${d.photo}" class="photo-preview" alt="Фото">` : "—"}</td>
            <td>${actions}</td>
        </tr>`;
    });
}

function searchMedCardsAdmin() {
    const filter = document.getElementById('med-search-admin').value.toLowerCase();
    document.querySelectorAll("#med-table-admin tbody tr").forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(filter) ? "" : "none";
    });
}

function toggleSortMedCards() {
    sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
    const btn = document.getElementById('sort-btn');
    btn.innerText = `Сортировать по сроку ${sortDirection === 'desc' ? '↓' : '↑'} (от ${sortDirection === 'desc' ? 'актуального к неактуальному' : 'неактуального к актуальному'})`;
    sortMedCards(sortDirection);
    renderMedCardsAdmin();
}

function sortMedCards(direction) {
    medCardsData.sort((a, b) => {
        const dateA = new Date(a.expiry);
        const dateB = new Date(b.expiry);
        return direction === 'desc' ? dateB - dateA : dateA - dateB;
    });
}

function exportMedCardsToExcel() {
    const data = medCardsData.map(d => ({
        Имя: d.name,
        Паспорт: d.passport,
        Срок: formatDate(d.expiry),
        Статус: d.daysLeft > 0 ? "Допущен" : "Не допущен",
        Фото: d.photo || ""
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MedCards");
    XLSX.writeFile(wb, "medcards.xlsx");
}

async function loadHistory() {
    if (currentUserRole !== 'admin') {
        document.getElementById('history-no-access').style.display = 'block';
        document.getElementById('history-loading').style.display = 'none';
        document.getElementById('history-table').style.display = 'none';
        document.getElementById('history-empty').style.display = 'none';
        return;
    }
    document.getElementById('history-no-access').style.display = 'none';
    document.getElementById('history-loading').style.display = 'block';
    document.getElementById('history-table').style.display = 'none';
    document.getElementById('history-empty').style.display = 'none';

    try {
        const snapshot = await db.ref("logs").orderByChild('timestamp').limitToLast(100).once("value");
        const tbody = document.querySelector("#history-table tbody");
        tbody.innerHTML = "";

        if (!snapshot.exists()) {
            document.getElementById('history-empty').style.display = 'block';
            return;
        }

        snapshot.forEach(child => {
            const log = child.val();
            tbody.innerHTML += `
            <tr>
                <td>${new Date(log.timestamp).toLocaleString('ru-RU')}</td>
                <td>${log.userName || log.userUid}</td>
                <td>${log.type}</td>
                <td>${log.details}</td>
            </tr>`;
        });

        document.getElementById('history-table').style.display = 'table';
    } catch (e) {
        console.error(e);
        document.getElementById('history-empty').innerText = 'Ошибка загрузки';
        document.getElementById('history-empty').style.display = 'block';
    } finally {
        document.getElementById('history-loading').style.display = 'none';
    }
}

async function loadUsers() {
    document.getElementById('users-loading').style.display = 'block';
    document.getElementById('users-table').style.display = 'none';
    document.getElementById('users-empty').style.display = 'none';
    document.getElementById('users-no-access').style.display = 'none';

    if (currentUserRole !== 'admin') {
        document.getElementById('users-no-access').style.display = 'block';
        document.getElementById('users-loading').style.display = 'none';
        return;
    }

    try {
        const snapshot = await db.ref("users").once("value");
        const tbody = document.querySelector("#users-table tbody");
        tbody.innerHTML = "";

        if (!snapshot.exists()) {
            document.getElementById('users-empty').style.display = 'block';
            return;
        }

        snapshot.forEach(child => {
            const u = child.val();
            const actions = `
                <button class="cyber-btn small" onclick="openEditUser('${child.key}', '${u.name}', '${u.email}', '${u.role}')">Ред.</button>
                <button class="cyber-btn small danger" onclick="deleteUser('${child.key}', '${u.email}')">Удал.</button>
            `;
            tbody.innerHTML += `
            <tr>
                <td>${u.name || ""}</td>
                <td>${u.email}</td>
                <td>${u.role}</td>
                <td>${actions}</td>
            </tr>`;
        });

        document.getElementById('users-table').style.display = 'table';
    } catch (e) {
        console.error(e);
        document.getElementById('users-empty').innerText = 'Ошибка загрузки';
        document.getElementById('users-empty').style.display = 'block';
    } finally {
        document.getElementById('users-loading').style.display = 'none';
    }
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUserUid = user.uid;
        try {
            const snap = await db.ref('users/' + user.uid).once('value');
            if (snap.exists()) {
                const data = snap.val();
                currentUserName = data.name || user.email;
                currentUserRole = data.role || "checker";
                document.getElementById('user-name').innerText = currentUserName;
                document.getElementById('user-role').innerText = currentUserRole;

                document.getElementById('dashboard').style.display = 'block';
                document.getElementById('guest-view').style.display = 'none';
                document.getElementById('auth').style.display = 'none';

                if (currentUserRole !== 'admin') {
                    document.getElementById('history-btn').style.display = 'none';
                    document.getElementById('users-btn').style.display = 'none';
                }

                showTab('medcards-tab');

                logAction('login', `Вход в систему`);
            } else {
                await auth.signOut();
            }
        } catch (e) {
            console.error(e);
            await auth.signOut();
        }
    } else {
        currentUserUid = null;
        currentUserName = null;
        currentUserRole = null;
        showGuestView();
    }
});

// Оптимизация: слушаем изменения только когда вкладка медкарт открыта
let medCardsListener = null;
document.addEventListener('DOMContentLoaded', () => {
    const medTab = document.getElementById('medcards-tab');
    new MutationObserver(() => {
        if (medTab.style.display === 'block') {
            if (!medCardsListener) {
                medCardsListener = db.ref('medcards').on('value', loadMedCardsAdmin);
            }
        } else {
            if (medCardsListener) {
                db.ref('medcards').off('value', medCardsListener);
                medCardsListener = null;
            }
        }
    }).observe(medTab, { attributes: true, attributeFilter: ['style'] });
});

showGuestView();

// === MP TAB LOGIC ===
// === ТВОИ НАСТРОЙКИ ===
const mpFirebaseConfig = {
  apiKey: "AIzaSyAO9HHeTDY7wPvIRopUjFyyVsgbcKfNhKw",
  authDomain: "mpgta5rp-fb175.firebaseapp.com",
  projectId: "mpgta5rp-fb175",
  storageBucket: "mpgta5rp-fb175.firebasestorage.app",
  messagingSenderId: "1097127418869",
  appId: "1:1097127418869:web:1dba0c31e1422763b45ebc",
  measurementId: "G-499HG9VESJ",
  databaseURL: "https://mpgta5rp-fb175-default-rtdb.firebaseio.com"
};

const MP_WEBHOOK = "https://discord.com/api/webhooks/1434674896058974389/N6S8CGFexsPXZOznRh2VXDRZWtJwJDSySW1P1swEI6UxVE-QRHNNCAs5JpcLmWLQOJOr";
const ROLES = "<@&860246345343959050> <@&1018540333547663401>";
const FORUM = "https://forum.gta5rp.com/forums/meroprijatija-servera.425/";
const BASE_URL = "https://forum.gta5rp.com";
const CHECK_INTERVAL = 30 * 60 * 1000; // 1 час
// =======================

const mpApp = firebase.initializeApp(mpFirebaseConfig, "mpApp");
const mpDb = firebase.database(mpApp);
const sentRef = mpDb.ref("sent_topics");

const logEl = document.getElementById("log");
const statusEl = document.getElementById("status");

let sentCache = {};
let mpInterval = null;
let mpInitialized = false;

function mpLog(msg, type = "info") {
  const t = new Date().toLocaleTimeString();
  const color = type === "error" ? "#ff5555" : type === "success" ? "#00ff99" : "#ccc";
  logEl.innerHTML += `<div style="color:${color}">[${t}] ${msg}</div>`;
  logEl.scrollTop = logEl.scrollHeight;
}

function extractDate(title) {
  const m = title.match(/(\d{1,2})[.:](\d{1,2})[.:](\d{4}).*?(\d{1,2}):(\d{2})/);
  if (m) {
    const [_, d, mth, y, h, min] = m;
    return `${d.padStart(2, '0')}.${mth.padStart(2, '0')}.${y} в ${h.padStart(2, '0')}:${min}`;
  }
  return "Дата не указана";
}

function parseDate(dateStr) {
  const m = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4}) в (\d{2}):(\d{2})/);
  if (m) {
    const [_, d, mth, y, h, min] = m;
    return new Date(y, mth - 1, d, h, min);
  }
  return null;
}

async function loadSentCache() {
  const snap = await sentRef.once("value");
  sentCache = snap.val() || {};
}

async function sendToDiscordMp(topic) {
  if (sentCache[topic.id]) return;
  sentCache[topic.id] = true;
  const text = `${ROLES}\n**${topic.title}**\n${topic.date}\n${topic.url}`;
  try {
    await fetch(MP_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text })
    });
    await sentRef.child(topic.id).set(true);
    mpLog(`✅ Отправлено: ${topic.title}`, "success");
  } catch (e) {
    mpLog(`❌ Ошибка Discord: ${e.message}`, "error");
  }
}

async function checkForum() {
  mpLog("🔍 Проверяю форум...");
  try {
    // --- Используем стабильный прокси API ---
    const proxy = "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(FORUM);
    const res = await fetch(proxy);
    if (!res.ok) throw new Error("Ошибка прокси или форум недоступен");
    const contents = await res.text();

    const doc = new DOMParser().parseFromString(contents, "text/html");
    const topics = [];
    doc.querySelectorAll(".structItem").forEach(el => {
      const a = el.querySelector(".structItem-title a:last-child");
      if (!a) return;
      let href = a.getAttribute("href");
      if (!href.startsWith("http")) href = BASE_URL + href;
      const idParts = href.split('.');
      const id = idParts[idParts.length - 1].split('/')[0];
      const title = a.textContent.trim();
      if (title.includes("МП") || title.includes("ГМП")) {
        const dateStr = extractDate(title);
        const dateObj = parseDate(dateStr);
        topics.push({ id, title, url: href, date: dateStr, dateObj });
      }
    });

    topics.sort((a, b) => a.dateObj - b.dateObj);
    const now = new Date();

    let newCnt = 0;
    for (const t of topics) {
      if (!t.dateObj || t.dateObj < now || sentCache[t.id]) continue;
      await sendToDiscordMp(t);
      newCnt++;
      await new Promise(r => setTimeout(r, 1000));
    }

    if (newCnt === 0) mpLog("✔ Новых МП нет");
  } catch (e) {
    mpLog(`❌ Ошибка: ${e.message}`, "error");
  }
}

window.checkNow = async () => {
  statusEl.textContent = "Работаю...";
  await loadSentCache();
  await checkForum();
  statusEl.textContent = "Онлайн";
};

window.resetDB = async () => {
  if (confirm("Удалить всю базу отправленных МП?")) {
    await sentRef.remove();
    sentCache = {};
    mpLog("🗑 База сброшена");
  }
};

async function initMP() {
  if (mpInitialized) return;
  mpInitialized = true;

  statusEl.textContent = "Онлайн";
  mpLog("🚀 Бот запущен (автопроверка раз в час)");
  await loadSentCache();
  await checkForum();
  mpInterval = setInterval(async () => {
    await loadSentCache();
    await checkForum();
  }, CHECK_INTERVAL);
}

// === НОВАЯ ЛОГИКА АВТОУВЕДОМЛЕНИЙ О СРОКЕ МЕДКАРТ ===

const MED_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 часа

let medNotifyCache = {}; // Кэш уже отправленных уведомлений за текущий день
let medNotifyInterval = null;
let medNotifyInitialized = false;

// Загружаем кэш отправленных уведомлений (чтобы не дублировать в один день)
async function loadMedNotifyCache() {
  try {
    const snap = await db.ref('med_notify_sent').once('value');
    medNotifyCache = snap.val() || {};
  } catch (e) {
    console.error('Ошибка загрузки кэша уведомлений медкарт:', e);
    medNotifyCache = {};
  }
}

// Сохраняем кэш в Firebase (на отдельной ветке, чтобы не мешать основным данным)
async function saveMedNotifyCache() {
  try {
    await db.ref('med_notify_sent').set(medNotifyCache);
  } catch (e) {
    console.error('Ошибка сохранения кэша уведомлений:', e);
  }
}

// Основная функция проверки всех медкарт
async function checkMedExpirations() {
  console.log('🔍 Проверка сроков медкарт...');
  try {
    const snapshot = await db.ref('medcards').once('value');
    if (!snapshot.exists()) return;

    let notifiedSomething = false;

    snapshot.forEach(child => {
      const card = child.val();
      const id = child.key;
      const daysLeft = getDaysLeft(card.expiry);

      // Пропускаем, если нет даты
      if (!card.expiry) return;

      // Инициализируем поле notifiedDays, если его нет
      if (!card.notifiedDays) card.notifiedDays = [];

      // Просрочена — отправляем каждый день
      if (daysLeft <= 0) {
        if (!medNotifyCache[`${id}_expired`]) {
          sendExpiryNotification(card.name, card.passport, card.expiry, daysLeft);
          medNotifyCache[`${id}_expired`] = true;
          notifiedSomething = true;
        }
      }
      // Ровно 2 дня осталось
      else if (daysLeft === 2 && !card.notifiedDays.includes(2)) {
        sendExpiryNotification(card.name, card.passport, card.expiry, daysLeft);
        card.notifiedDays.push(2);
        db.ref(`medcards/${id}/notifiedDays`).set(card.notifiedDays);
        notifiedSomething = true;
      }
      // Ровно 1 день остался
      else if (daysLeft === 1 && !card.notifiedDays.includes(1)) {
        sendExpiryNotification(card.name, card.passport, card.expiry, daysLeft);
        card.notifiedDays.push(1);
        db.ref(`medcards/${id}/notifiedDays`).set(card.notifiedDays);
        notifiedSomething = true;
      }
    });

    if (notifiedSomething) {
      await saveMedNotifyCache();
    }

    console.log('✔ Проверка медкарт завершена');
  } catch (e) {
    console.error('Ошибка при проверке медкарт:', e);
  }
}

// Инициализация автопроверки (запускается только после логина)
async function initMedNotify() {
  if (medNotifyInitialized) return;
  medNotifyInitialized = true;

  await loadMedNotifyCache();
  await checkMedExpirations(); // Первая проверка сразу

  // Очищаем кэш просроченных в полночь (чтобы уведомления о просрочке шли каждый день)
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const timeToMidnight = midnight - now;

  setTimeout(() => {
    medNotifyCache = Object.fromEntries(
      Object.entries(medNotifyCache).filter(([key]) => !key.endsWith('_expired'))
    );
    saveMedNotifyCache();
    // И запускаем ежедневную проверку
    medNotifyInterval = setInterval(async () => {
      medNotifyCache = Object.fromEntries(
        Object.entries(medNotifyCache).filter(([key]) => !key.endsWith('_expired'))
      );
      await checkMedExpirations();
    }, MED_CHECK_INTERVAL);
  }, timeToMidnight);

  // Обычный интервал на всякий случай
  medNotifyInterval = setInterval(checkMedExpirations, MED_CHECK_INTERVAL);
}

// Модифицируем onAuthStateChanged — запускаем проверку после входа
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUserUid = user.uid;
    try {
      const snap = await db.ref('users/' + user.uid).once('value');
      if (snap.exists()) {
        const data = snap.val();
        currentUserName = data.name || user.email;
        currentUserRole = data.role || "checker";
        document.getElementById('user-name').innerText = currentUserName;
        document.getElementById('user-role').innerText = currentUserRole;

        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('guest-view').style.display = 'none';
        document.getElementById('auth').style.display = 'none';

        if (currentUserRole !== 'admin') {
          document.getElementById('history-btn').style.display = 'none';
          document.getElementById('users-btn').style.display = 'none';
        }

        showTab('medcards-tab');

        logAction('login', `Вход в систему`);

        // === ЗАПУСК АВТОПРОВЕРКИ МЕДКАРТ ===
        initMedNotify();
      } else {
        await auth.signOut();
      }
    } catch (e) {
      console.error(e);
      await auth.signOut();
    }
  } else {
    currentUserUid = null;
    currentUserName = null;
    currentUserRole = null;
    if (medNotifyInterval) {
      clearInterval(medNotifyInterval);
      medNotifyInitialized = false;
    }
    showGuestView();
  }
});

showGuestView();