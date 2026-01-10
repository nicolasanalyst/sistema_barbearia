import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, onSnapshot, deleteDoc, doc, Timestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =========================================================================
//  ⚠️ PASSO 1: CONFIGURAÇÃO DO FIREBASE ⚠️
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyB9k6oekmBmLgQCaGQsrNLXWZSdMYwvbV4",
    authDomain: "minha-barbearia-c4ea8.firebaseapp.com",
    projectId: "minha-barbearia-c4ea8",
    storageBucket: "minha-barbearia-c4ea8.firebasestorage.app",
    messagingSenderId: "161533411264",
    appId: "1:161533411264:web:91e2258bfe0e520f0c5225"
};
// =========================================================================

const COLLECTION_NAME = 'appointments_v2';
let app, auth, db, currentUser;
let deleteTargetId = null;
let allAppointmentsForExport = [];

// Inicialização Segura
function initApp() {
    // Verifica se o usuário preencheu a config
    if (!firebaseConfig.apiKey) {
        document.getElementById('app-loader').classList.add('hidden');
        document.getElementById('setup-error').classList.remove('hidden');
        document.getElementById('setup-error').classList.add('flex');
        lucide.createIcons();
        return;
    }

    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        
        // Monitora Auth
        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                // Salva UID localmente para identificar "Meus Agendamentos"
                localStorage.setItem('user_uid', user.uid);
                document.getElementById('app-loader').classList.add('hidden');
                
                // Redireciona para home se estiver no loading
                const isHidden = document.getElementById('view-home').classList.contains('hidden') && 
                                    document.getElementById('view-client').classList.contains('hidden') &&
                                    document.getElementById('view-barber-dashboard').classList.contains('hidden');
                if (isHidden) navigateTo('home');
            } else {
                signInAnonymously(auth).catch(e => console.error("Erro auth:", e));
            }
        });
    } catch (e) {
        console.error("Erro ao iniciar Firebase:", e);
        alert("Erro na configuração do Firebase. Verifique o console.");
    }
}

initApp();

// --- SISTEMA DE NAVEGAÇÃO ---
window.navigateTo = (viewName) => {
    const views = ['view-home', 'view-client', 'view-barber-login', 'view-barber-dashboard', 'view-my-appointments', 'app-loader', 'setup-error'];
    views.forEach(id => {
        document.getElementById(id).classList.add('hidden');
        document.getElementById(id).classList.remove('flex');
    });

    const target = document.getElementById(`view-${viewName}`);
    if(target) {
        target.classList.remove('hidden');
        if(['home', 'barber-login', 'setup-error'].includes(viewName)) target.classList.add('flex');
    }
    
    const btnBack = document.getElementById('btn-back');
    if(viewName === 'home' || viewName === 'setup-error') btnBack.classList.add('hidden');
    else btnBack.classList.remove('hidden');
    
    lucide.createIcons();
};

// --- CHATBOT ---
let chatStep = 0;
let bookingData = {};
const chatContainer = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

window.startClientFlow = () => {
    navigateTo('client');
    if(chatContainer.children.length === 0) resetChat();
};

window.resetChat = () => {
    chatContainer.innerHTML = '';
    chatStep = 0;
    bookingData = { name: '', service: '', dateOnly: '', fullDate: '' };
    document.getElementById('chat-input-area').classList.remove('hidden');
    document.getElementById('chat-restart-area').classList.add('hidden');
    addBotMessage("Olá! Bem-vindo à Barbearia. Qual é o seu nome?");
};

window.handleChatSend = () => {
    const text = chatInput.value.trim();
    if(!text) return;
    processUserInput(text);
    chatInput.value = '';
};

const processUserInput = (text) => {
    if(chatStep !== 2 && chatStep !== 3) addUserMessage(text);
    
    setTimeout(async () => {
        if(chatStep === 0) {
            bookingData.name = text;
            addBotMessage(`Prazer, ${text}! Qual serviço deseja?`, 'options', ['Corte de Cabelo (R$ 40)', 'Barba (R$ 30)', 'Cabelo + Barba (R$ 60)', 'Pezinho (R$ 15)']);
            chatStep = 1;
        } else if (chatStep === 1) {
            bookingData.service = text;
            addBotMessage(`Certo! Escolha o dia:`, 'date_selector');
            chatStep = 2;
        }
    }, 500);
};

// Helpers de Data
window.handleOptionClick = (val) => processUserInput(val);

window.handleDatePreset = (type) => {
    const d = new Date();
    if (type === 'tomorrow') d.setDate(d.getDate() + 1);
    const val = d.toISOString().split('T')[0];
    const label = type === 'today' ? 'Hoje' : 'Amanhã';
    addUserMessage(`${label} (${d.toLocaleDateString('pt-BR')})`);
    loadTimeSlots(val);
};

window.handleDateSelect = (val) => {
    if(!val) return;
    const [y, m, d] = val.split('-');
    addUserMessage(`Dia ${d}/${m}/${y}`);
    loadTimeSlots(val);
};

const loadTimeSlots = async (dateStr) => {
    bookingData.dateOnly = dateStr;
    const loadingMsg = addBotMessage('<i class="animate-spin" data-lucide="loader-2"></i> Verificando agenda...', 'html');
    
    try {
        // Busca todos os agendamentos (Simple Query para evitar erro de índice composto)
        const q = query(collection(db, COLLECTION_NAME));
        const snapshot = await getDocs(q);
        
        // Filtra em memória (seguro para baixo volume)
        const bookedTimes = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.date && data.date.startsWith(dateStr)) {
                bookedTimes.push(data.date);
            }
        });

        // Remove loading e mostra slots
        chatContainer.lastChild.remove();
        addBotMessage(`Horários para ${dateStr.split('-').reverse().join('/')}:`, 'time_slots', { dateStr, bookedTimes });
        chatStep = 3;
    } catch (e) {
        console.error(e);
        chatContainer.lastChild.remove();
        addBotMessage("⚠️ Erro ao conectar. Verifique sua internet ou a configuração do Firebase.");
    }
};

window.handleTimeSelect = async (dateStr, timeStr) => {
    const fullDate = `${dateStr}T${timeStr}`;
    bookingData.fullDate = fullDate;
    addUserMessage(timeStr);

    // Salva no Firestore
    try {
        await addDoc(collection(db, COLLECTION_NAME), {
            customerName: bookingData.name,
            service: bookingData.service,
            date: fullDate,
            userId: currentUser ? currentUser.uid : 'anon',
            createdAt: Timestamp.now()
        });

        const dateObj = new Date(fullDate);
        const fmtDate = dateObj.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        addBotMessage(`✅ Agendado para ${fmtDate}!`);
        document.getElementById('chat-input-area').classList.add('hidden');
        document.getElementById('chat-restart-area').classList.remove('hidden');
        chatStep = 4;
    } catch (e) {
        console.error(e);
        addBotMessage("Erro ao salvar o agendamento. Tente novamente.");
    }
};

// --- DASHBOARDS & LISTAS ---
let unsubscribe = null;

const subscribeToAppointments = (filterUserUid = null) => {
    if (unsubscribe) unsubscribe();
    
    const q = query(collection(db, COLLECTION_NAME));
    
    unsubscribe = onSnapshot(q, (snapshot) => {
        let appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Salva todos para o Admin
        allAppointmentsForExport = appointments;
        
        // Filtra se for para um usuário específico
        if (filterUserUid) {
            appointments = appointments.filter(a => a.userId === filterUserUid);
        }

        appointments.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Atualiza UI baseada na View atual
        const listId = filterUserUid ? 'my-appointments-list' : 'appointments-list';
        const emptyId = filterUserUid ? 'my-appointments-empty' : 'empty-state';
        
        const listEl = document.getElementById(listId);
        const emptyEl = document.getElementById(emptyId);

        if (appointments.length === 0) {
            if(listEl) listEl.innerHTML = '';
            if(emptyEl) emptyEl.classList.remove('hidden');
        } else {
            if(emptyEl) emptyEl.classList.add('hidden');
            if(listEl) {
                listEl.innerHTML = appointments.map(apt => createCard(apt, !filterUserUid)).join('');
                lucide.createIcons();
            }
        }

        // Atualiza Stats (Apenas Admin)
        if (!filterUserUid) updateStats(appointments);
    });
};

const createCard = (apt, isAdmin) => {
    const d = new Date(apt.date);
    const isToday = new Date().toDateString() === d.toDateString();
    const dayName = d.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0,3).toUpperCase();
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return `
        <div class="p-4 rounded-xl border flex justify-between items-center bg-zinc-900 border-zinc-800 ${isToday ? 'border-orange-500/30' : ''}">
            <div class="flex gap-4 items-center">
                <div class="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400">
                    <span class="text-[10px] font-bold">${dayName}</span>
                    <span class="text-lg font-bold leading-none">${d.getDate()}</span>
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <h3 class="font-bold text-zinc-100">${apt.customerName || apt.service}</h3>
                        ${isToday ? '<span class="text-[9px] bg-orange-500 text-white px-1.5 rounded font-bold">HOJE</span>' : ''}
                    </div>
                    <div class="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                        <span><i data-lucide="clock" class="inline w-3 h-3 text-orange-500"></i> ${timeStr}</span>
                        <span>•</span>
                        <span>${apt.service}</span>
                    </div>
                </div>
            </div>
            <button onclick="openDeleteModal('${apt.id}')" class="p-2 text-zinc-500 hover:text-red-500 transition-colors">
                <i data-lucide="trash-2" class="w-5 h-5"></i>
            </button>
        </div>
    `;
};

const updateStats = (apts) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    let todayCount = 0, weekCount = 0, monthCount = 0;
    
    apts.forEach(a => {
        const d = new Date(a.date);
        const dStart = new Date(d); dStart.setHours(0,0,0,0);
        
        if (dStart.getTime() === today.getTime()) todayCount++;
        if (d.getMonth() === today.getMonth()) monthCount++;
        // Lógica simples de semana (últimos 7 dias)
        const diffTime = Math.abs(today - dStart);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays <= 7 && d >= today) weekCount++;
    });

    document.getElementById('stat-today').innerText = todayCount;
    document.getElementById('stat-week').innerText = weekCount;
    document.getElementById('stat-month').innerText = monthCount;
};

// --- EXPORTS GLOBAIS ---
window.showMyAppointments = () => {
    navigateTo('my-appointments');
    subscribeToAppointments(currentUser.uid);
};

window.initDashboard = () => {
    navigateTo('barber-dashboard');
    subscribeToAppointments(null); // Null = busca tudo
};

// Login Admin
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pwd = document.getElementById('login-password').value;
    
    // Credenciais Hardcoded (Simples e funcional para este caso)
    if(email === 'admin@barber.com' && pwd === 'admin123') {
        localStorage.setItem('barber_auth', 'true');
        window.initDashboard();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
});

window.checkBarberAuth = () => {
    if(localStorage.getItem('barber_auth') === 'true') window.initDashboard();
    else navigateTo('barber-login');
};

window.logoutBarber = () => {
    localStorage.removeItem('barber_auth');
    navigateTo('home');
};

// Modal Deletar
window.openDeleteModal = (id) => {
    deleteTargetId = id;
    document.getElementById('delete-modal').classList.remove('hidden');
};
window.closeModal = () => {
    deleteTargetId = null;
    document.getElementById('delete-modal').classList.add('hidden');
};
document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if(!deleteTargetId) return;
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, deleteTargetId));
        closeModal();
    } catch(e) {
        alert("Erro ao excluir: " + e.message);
    }
});

// Excel
window.exportToExcel = () => {
    if(allAppointmentsForExport.length === 0) return alert("Sem dados.");
    const data = allAppointmentsForExport.map(a => ({
        Data: new Date(a.date).toLocaleDateString(),
        Hora: new Date(a.date).toLocaleTimeString(),
        Cliente: a.customerName,
        Serviço: a.service
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Agenda");
    XLSX.writeFile(wb, "Agenda.xlsx");
};

// Geração de UI do Chat
function addBotMessage(html, type, data) {
    const div = document.createElement('div');
    div.className = "flex justify-start fade-in";
    let inner = `<div class="bg-zinc-800 text-zinc-200 border border-zinc-700 p-3 rounded-2xl rounded-tl-none max-w-[85%] text-sm leading-relaxed">${html}</div>`;
    
    if(type === 'options') {
        const btns = data.map(o => `<button onclick="handleOptionClick('${o}')" class="bg-zinc-700 hover:bg-zinc-600 text-white py-2 px-3 rounded-lg text-xs w-full text-left mt-1 border border-zinc-600">${o}</button>`).join('');
        inner = `<div class="max-w-[85%]"><div class="bg-zinc-800 text-zinc-200 border border-zinc-700 p-3 rounded-2xl rounded-tl-none text-sm mb-1">${html}</div><div class="space-y-1">${btns}</div></div>`;
    }
    
    if(type === 'date_selector') {
        inner = `
        <div class="max-w-[90%] gap-2 flex flex-col">
            <div class="bg-zinc-800 text-zinc-200 border border-zinc-700 p-3 rounded-2xl rounded-tl-none text-sm">${html}</div>
            <button onclick="handleDatePreset('today')" class="bg-zinc-800 p-3 rounded-xl flex justify-between items-center border border-zinc-700 hover:bg-zinc-700"><span class="text-sm">Hoje</span><i data-lucide="calendar" class="w-4 h-4 text-orange-500"></i></button>
            <button onclick="handleDatePreset('tomorrow')" class="bg-zinc-800 p-3 rounded-xl flex justify-between items-center border border-zinc-700 hover:bg-zinc-700"><span class="text-sm">Amanhã</span><i data-lucide="calendar-clock" class="w-4 h-4 text-zinc-400"></i></button>
            <div class="bg-zinc-800 p-2 rounded-xl border border-zinc-700"><input type="date" onchange="handleDateSelect(this.value)" class="w-full bg-zinc-950 text-white p-2 rounded text-sm"></div>
        </div>`;
    }

    if(type === 'time_slots') {
        const { dateStr, bookedTimes } = data;
        const slots = [];
        const start = 7 * 60; const end = 18 * 60; const step = 40;
        
        const now = new Date();
        const isToday = dateStr === now.toISOString().split('T')[0];
        const nowMins = now.getHours() * 60 + now.getMinutes();

        for(let t = start; t <= end; t += step) {
            if(t >= 12*60 && t < 13*60) continue; // Almoço
            
            const h = Math.floor(t/60).toString().padStart(2,'0');
            const m = (t%60).toString().padStart(2,'0');
            const time = `${h}:${m}`;
            
            let disabled = false;
            let label = "Livre";
            let color = "text-green-500";
            
            if(isToday && t < nowMins) { disabled = true; label = "Passou"; color = "text-zinc-600"; }
            if(bookedTimes.some(b => b.includes(`T${time}`))) { disabled = true; label = "Ocupado"; color = "text-red-500"; }

            slots.push(`
                <button ${disabled ? 'disabled' : `onclick="handleTimeSelect('${dateStr}','${time}')"`} class="w-full border p-2 rounded-lg flex justify-between items-center ${disabled ? 'bg-zinc-900 border-zinc-800 opacity-50' : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'}">
                    <span class="text-sm font-bold flex gap-2 items-center"><i data-lucide="clock" class="w-3 h-3 ${color}"></i> ${time}</span>
                    <span class="text-[10px] text-zinc-500">${label}</span>
                </button>
            `);
        }
        inner = `<div class="max-w-[90%] gap-2 flex flex-col"><div class="bg-zinc-800 text-zinc-200 border border-zinc-700 p-3 rounded-2xl rounded-tl-none text-sm">${html}</div><div class="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">${slots.join('')}</div></div>`;
    }

    div.innerHTML = inner;
    chatContainer.appendChild(div);
    lucide.createIcons();
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return div;
}

function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = "flex justify-end fade-in";
    div.innerHTML = `<div class="bg-orange-600 text-white p-3 rounded-2xl rounded-tr-none max-w-[85%] text-sm shadow-sm">${text}</div>`;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Enter no input
chatInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') handleChatSend(); });