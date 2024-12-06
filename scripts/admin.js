// Import Firebase modules
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    deleteDoc, 
    doc,
    getDoc,
    onSnapshot,
    updateDoc,
    query,
    orderBy,
    serverTimestamp,
    where,
    limit,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Add increment to your Firebase imports
import { increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Make sure to export increment
window.increment = increment;

// Make Firebase functions available globally
window.collection = collection;
window.addDoc = addDoc;
window.getDocs = getDocs;
window.deleteDoc = deleteDoc;
window.doc = doc;
window.getDoc = getDoc;
window.updateDoc = updateDoc;
window.onSnapshot = onSnapshot;
window.serverTimestamp = serverTimestamp;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.limit = limit;
window.writeBatch = writeBatch;

// Check authentication and initialize data
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User is signed in:", user.email);
        if (!user.email.includes('admin')) {
            window.location.href = 'index.html';
        }
        // Initialize data and listeners
        initializeData();
        initializeRealTimeListeners();
    } else {
        console.log("No user signed in");
        window.location.href = 'index.html';
    }
});

// Define handleLogout function
window.handleLogout = async function() {
    try {
        await signOut(auth);
        console.log("User signed out successfully");
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Error signing out:", error);
        alert("Error signing out: " + error.message);
    }
};

// Initialize data function
async function initializeData() {
    try {
        await loadDashboard();
        await loadEvents();
        await loadTickets();
        await updateTicketStats(); 
    } catch (error) {
        console.error("Error initializing data:", error);
    }
}


function initializeDashboardListeners() {
    const eventsRef = collection(db, 'events');
    const ticketsRef = collection(db, 'tickets');

    const unsubscribeTickets = onSnapshot(ticketsRef, () => {
        if (document.getElementById('dashboard').style.display === 'block') {
            loadDashboard();
        }
    });

    const unsubscribeEvents = onSnapshot(eventsRef, () => {
        if (document.getElementById('dashboard').style.display === 'block') {
            loadDashboard();
        }
    });

    return () => {
        unsubscribeTickets();
        unsubscribeEvents();
    };
}
// Navigation function
async function showSection(sectionId) {
    try {
        console.log(`Showing section: ${sectionId}`);
        
        // Hide all sections first
        document.querySelectorAll('.content-section').forEach(section => {
            section.style.display = 'none';
        });

        // Show selected section
        const selectedSection = document.getElementById(sectionId);
        if (selectedSection) {
            selectedSection.style.display = 'block';
        }

        // Update menu items
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        const menuItem = document.querySelector(`.menu-item[onclick*="${sectionId}"]`);
        if (menuItem) {
            menuItem.classList.add('active');
        }

        // Initialize section-specific content
        if (sectionId === 'dashboard') {
            await loadDashboard();
            initializeDashboardListeners();
        }

    } catch (error) {
        console.error(`Error showing section ${sectionId}:`, error);
    }
}

// Update populateEventSelector function to properly handle passes
async function populateEventSelector(selectorId) {
    try {
        const selector = document.getElementById(selectorId);
        if (!selector) return;

        selector.innerHTML = '<option value="">Select an Event</option>';
        const now = new Date();

        // Get events from Firestore
        const eventsRef = collection(db, 'events');
        const eventsSnapshot = await getDocs(eventsRef);
        
        eventsSnapshot.forEach(doc => {
            const event = doc.data();
            const bookingStart = new Date(event.bookingStartDate);
            const bookingEnd = new Date(event.bookingDeadline);
            
            // Only show events with open bookings
            if (now >= bookingStart && now <= bookingEnd) {
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = event.name;
                selector.appendChild(option);
            }
        });
    } catch (error) {
        console.error("Error populating event selector:", error);
    }
}

// Make sure db is properly initialized and available
if (!window.db) {
    console.error('Firebase db not initialized');
}

// Make functions globally available
window.populateEventSelector = populateEventSelector;

// Dashboard function
async function loadDashboard() {
    try {
        const eventsRef = collection(db, 'events');
        const ticketsRef = collection(db, 'tickets');

        const [eventsSnapshot, ticketsSnapshot] = await Promise.all([
            getDocs(eventsRef),
            getDocs(ticketsRef)
        ]);

        let stats = {
            totalEvents: 0,
            upcomingEvents: 0,
            completedEvents: 0,
            totalTickets: 0,
            ticketsSold: 0,
            availableTickets: 0,
            totalRevenue: 0,
            ticketsScanned: 0
        };

        // Calculate stats
        eventsSnapshot.forEach(doc => {
            const event = doc.data();
            if (!event.deleted && event.status !== 'deleted') {
                stats.totalEvents++;
                
                if (new Date(event.date) > new Date()) {
                    stats.upcomingEvents++;
                } else {
                    stats.completedEvents++;
                }

                if (event.eventType === 'hybrid') {
                    stats.totalTickets += (parseInt(event.tickets?.venue?.total) || 0) + 
                                        (parseInt(event.tickets?.online?.total) || 0);
                } else {
                    stats.totalTickets += parseInt(event.totalTickets) || 0;
                }
            }
        });

        // Calculate ticket stats
        ticketsSnapshot.forEach(doc => {
            const ticket = doc.data();
            if (ticket.paymentStatus === 'completed') {
                const ticketCount = parseInt(ticket.ticketCount) || 1;
                stats.ticketsSold += ticketCount;
                stats.totalRevenue += parseFloat(ticket.totalPrice) || 0;
                
                if (ticket.used) {
                    stats.ticketsScanned += ticketCount;
                }
            }
        });

        stats.availableTickets = Math.max(0, stats.totalTickets - stats.ticketsSold);

        // Get dashboard container
        const dashboardContent = document.getElementById('dashboard');
        if (!dashboardContent) return;

        // Create/update stats grid
        let statsGrid = dashboardContent.querySelector('.stats-grid');
        if (!statsGrid) {
            statsGrid = document.createElement('div');
            statsGrid.className = 'stats-grid';
            dashboardContent.appendChild(statsGrid);
        }

        // Update stats display
        statsGrid.innerHTML = `
            <div class="stat-card">
                <h3>Total Events</h3>
                <div class="number" id="totalEvents">${stats.totalEvents}</div>
            </div>
            <div class="stat-card">
                <h3>Upcoming Events</h3>
                <div class="number" id="upcomingEvents">${stats.upcomingEvents}</div>
            </div>
            <div class="stat-card">
                <h3>Completed Events</h3>
                <div class="number" id="completedEvents">${stats.completedEvents}</div>
            </div>
            <div class="stat-card">
                <h3>Total Tickets</h3>
                <div class="number" id="totalTickets">${stats.totalTickets}</div>
            </div>
            <div class="stat-card">
                <h3>Tickets Sold</h3>
                <div class="number" id="ticketsSold">${stats.ticketsSold}</div>
            </div>
            <div class="stat-card">
                <h3>Available Tickets</h3>
                <div class="number" id="availableTickets">${stats.availableTickets}</div>
            </div>
            <div class="stat-card">
                <h3>Total Revenue</h3>
                <div class="number" id="totalRevenue">${formatCurrency(stats.totalRevenue)}</div>
            </div>
            <div class="stat-card">
                <h3>Tickets Scanned</h3>
                <div class="number" id="ticketsScanned">${stats.ticketsScanned}</div>
            </div>
        `;

        // Remove existing carousel
        const existingCarousel = dashboardContent.querySelector('.events-carousel-section');
        if (existingCarousel) {
            existingCarousel.remove();
        }

        // Create carousel section
        const carouselSection = document.createElement('div');
        carouselSection.className = 'events-carousel-section';
        carouselSection.innerHTML = `
            <div class="carousel-container">
                <h2>Event Gallery</h2>
                <div class="swiper event-swiper">
                    <div class="swiper-wrapper">
                        <!-- Slides will be added here -->
                    </div>
                    <div class="swiper-pagination"></div>
                </div>
            </div>
        `;

        // Add carousel after stats grid
        statsGrid.insertAdjacentElement('afterend', carouselSection);

        // Add event slides
        const swiperWrapper = carouselSection.querySelector('.swiper-wrapper');
        if (swiperWrapper) {
            const eventsWithImages = eventsSnapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    imageUrl: Array.isArray(doc.data().images) ? doc.data().images[0] : doc.data().images
                }))
                .filter(event => {
                    return event.imageUrl && 
                           typeof event.imageUrl === 'string' && 
                           event.imageUrl.trim() !== '' && 
                           !event.deleted && 
                           event.status !== 'deleted';
                });

            if (eventsWithImages.length > 0) {
                eventsWithImages.forEach(event => {
                    const slide = document.createElement('div');
                    slide.className = 'swiper-slide';
                    slide.innerHTML = `
                        <div class="event-slide">
                            <div class="event-slide-image">
                                <img src="${event.imageUrl}" 
                                     alt="${event.name}" 
                                     onerror="this.src='assets/images/event-placeholder.jpg'"
                                     loading="lazy"/>
                            </div>
                            <div class="event-slide-info">
                                <h3>${event.name}</h3>
                                <p>${new Date(event.date).toLocaleDateString()}</p>
                            </div>
                        </div>
                    `;
                    swiperWrapper.appendChild(slide);
                });

                // Initialize Swiper
                setTimeout(() => {
                    new Swiper('.event-swiper', {
                        slidesPerView: 1,
                        spaceBetween: 0,
                        loop: true,
                        autoplay: {
                            delay: 5000,
                            disableOnInteraction: false,
                        },
                        pagination: {
                            el: '.swiper-pagination',
                            clickable: true,
                        },
                        effect: 'fade',
                        fadeEffect: {
                            crossFade: true
                        }
                    });
                }, 100);
            }
        }

    } catch (error) {
        console.error("Error loading dashboard:", error);
    }
}
        // Update recent tickets display
        async function loadRecentTickets() {
            try {
                const recentTicketsList = document.getElementById('recentTicketsList');
                // Clear existing content
                recentTicketsList.innerHTML = '';
        
                // Get all active events
                const eventsRef = collection(db, 'events');
                const eventsSnapshot = await getDocs(eventsRef);
                const activeEventIds = new Set();
                
                eventsSnapshot.docs.forEach(doc => {
                    const event = doc.data();
                    if (!event.deleted && event.status !== 'deleted') {
                        activeEventIds.add(doc.id);
                    }
                });
        
                // Query recent tickets
                const ticketsRef = collection(db, 'tickets');
                const recentTicketsQuery = query(
                    ticketsRef, 
                    orderBy('purchaseDate', 'desc'), 
                    limit(5)
                );
                const ticketsSnapshot = await getDocs(recentTicketsQuery);
        
                // Process tickets
                for (const ticketDoc of ticketsSnapshot.docs) {
                    const ticket = ticketDoc.data();
                    
                    // Skip tickets for deleted events
                    if (!activeEventIds.has(ticket.eventId)) continue;
        
                    const eventDoc = await getDoc(doc(db, 'events', ticket.eventId));
                    if (!eventDoc.exists()) continue;
        
                    const event = eventDoc.data();
                    const purchaseDate = new Date(ticket.purchaseDate).toLocaleDateString();
                    
                    const ticketItem = document.createElement('div');
                    ticketItem.className = 'recent-item';
                    ticketItem.innerHTML = `
                        <div class="recent-item-title">${event.name}</div>
                        <div class="recent-item-details">
                            <span>${purchaseDate}</span>
                            <span>${ticket.ticketCount} ticket(s)</span>
                            <span>${formatCurrency(ticket.totalPrice)}</span>
                        </div>
                    `;
                    recentTicketsList.appendChild(ticketItem);
                }
        
                if (recentTicketsList.children.length === 0) {
                    recentTicketsList.innerHTML = '<div class="no-data">No recent tickets</div>';
                }
        
            } catch (error) {
                console.error("Error loading recent tickets:", error);
                document.getElementById('recentTicketsList').innerHTML = 
                    '<div class="error-message">Error loading recent tickets</div>';
            }
        }

// Add these functions to handle verification
async function verifyTicketManually() {
    const ticketId = document.getElementById('ticketIdInput').value.trim();
    if (!ticketId) {
        alert('Please enter a ticket ID');
        return;
    }
    
    const result = await verifyTicket(ticketId);
    showVerificationResult(result);
}

// Initialize QR Scanner
async function initQRScanner() {
    if (!window.html5QrcodeScanner) {
        window.html5QrcodeScanner = new Html5QrcodeScanner(
            "qrReader", 
            { fps: 10, qrbox: { width: 250, height: 250 } }
        );
    }
}

// Start QR Scanner
async function startQRScanner() {
    try {
        await initQRScanner();
        window.html5QrcodeScanner.render(async (decodedText) => {
            const result = await verifyTicket(decodedText);
            showVerificationResult(result);
            await stopQRScanner();
        });
        document.querySelector('.scan-btn').style.display = 'none';
        document.querySelector('[onclick="stopQRScanner()"]').style.display = 'block';
    } catch (error) {
        console.error("Error starting QR scanner:", error);
        alert("Error starting scanner: " + error.message);
    }
}

// Stop QR Scanner
async function stopQRScanner() {
    try {
        if (window.html5QrcodeScanner) {
            await window.html5QrcodeScanner.clear();
        }
        document.querySelector('.scan-btn').style.display = 'block';
        document.querySelector('[onclick="stopQRScanner()"]').style.display = 'none';
    } catch (error) {
        console.error("Error stopping QR scanner:", error);
    }
}

// Make functions globally available
window.verifyTicketManually = verifyTicketManually;
window.initQRScanner = initQRScanner;
window.startQRScanner = startQRScanner;
window.stopQRScanner = stopQRScanner;

// Initialize passes section
async function initializePassesSection() {
    try {
        console.log('Starting passes section initialization...');
        await loadPassesStats();
        await loadAllPasses(); // This will now create and initialize filters
        console.log('Passes section initialized successfully');
    } catch (error) {
        console.error('Error in initializePassesSection:', error);
    }
}

// Setup role selector
function setupRoleSelector() {
    const roleSelector = document.getElementById('roleSelector');
    const otherRoleInput = document.getElementById('otherRoleInput');
    
    roleSelector.addEventListener('change', function() {
        otherRoleInput.style.display = this.value === 'other' ? 'block' : 'none';
    });
}

// Update loadPassesStats function
async function loadPassesStats() {
    try {
        const passesRef = collection(db, 'passes');
        const passesSnapshot = await getDocs(passesRef);
        
        let totalPasses = 0;
        let usedPasses = 0;
        let unusedPasses = 0;

        passesSnapshot.forEach(doc => {
            const pass = doc.data();
            totalPasses++;
            if (pass.used) {
                usedPasses++;
            } else {
                unusedPasses++;
            }
        });

        // Update stats display
        document.getElementById('totalPasses').textContent = totalPasses;
        document.getElementById('usedPasses').textContent = usedPasses;
        document.getElementById('unusedPasses').textContent = unusedPasses;

    } catch (error) {
        console.error("Error loading passes stats:", error);
    }
}

// Update generatePasses function
async function generatePasses() {
    try {
        const eventId = document.getElementById('eventSelectorForPasses').value;
        const roleSelector = document.getElementById('roleSelector');
        const customRoleInput = document.getElementById('customRole');
        const numberOfPasses = parseInt(document.getElementById('numberOfPasses').value);

        // Validation
        if (!eventId) {
            alert('Please select an event');
            return;
        }
        if (!roleSelector.value) {
            alert('Please select a role');
            return;
        }
        if (roleSelector.value === 'other' && !customRoleInput.value.trim()) {
            alert('Please enter a custom role');
            return;
        }
        if (!numberOfPasses || numberOfPasses < 1) {
            alert('Please enter a valid number of passes');
            return;
        }

        // Determine final role value
        const finalRole = roleSelector.value === 'other' ? customRoleInput.value.trim() : roleSelector.value;

        const batch = writeBatch(db);
        const passesRef = collection(db, 'passes');
        const generatedPasses = [];

        for (let i = 0; i < numberOfPasses; i++) {
            const passIdentifier = `PASS-${generateRandomFiveDigits()}-${getCurrentYear()}`;
            
            const passData = {
                eventId,
                role: finalRole,
                passIdentifier,
                createdAt: serverTimestamp(),
                used: false,
                issuedBy: auth.currentUser.email,
                issuedAt: new Date().toISOString(),
                version: '1.0'  // Add version for future compatibility
            };

            console.log('Creating pass with data:', passData);

            const newPassRef = doc(passesRef);
            batch.set(newPassRef, passData);
            generatedPasses.push(passData);
        }

        await batch.commit();
        
        // Display generated passes
        displayGeneratedPasses(generatedPasses);
        
        // Update stats
        await loadPassesStats();
        
        // Clear form
        customRoleInput.value = '';
        document.getElementById('numberOfPasses').value = '';
        document.getElementById('eventSelectorForPasses').value = '';
        roleSelector.value = '';
        document.getElementById('otherRoleInput').style.display = 'none';

        alert(`Successfully generated ${numberOfPasses} passes!`);

    } catch (error) {
        console.error("Error generating passes:", error);
        alert('Error generating passes: ' + error.message);
    }
}

// Generate unique pass identifier
function generatePassIdentifier() {
    const randomNum = generateRandomFiveDigits();
    const year = getCurrentYear();
    return `PASS-${randomNum}-${year}`;
}

// Update displayGeneratedPasses function
function displayGeneratedPasses(passes) {
    const container = document.getElementById('generatedPassesList');
    if (!container) {
        console.error('Generated passes container not found');
        return;
    }

    container.innerHTML = passes.map(pass => `
        <div class="generated-pass">
            <div class="pass-info">
                <p><strong>Pass ID:</strong> ${pass.passIdentifier}</p>
                <p><strong>Role:</strong> ${pass.role}</p>
            </div>
            <div class="pass-qr" id="qr-${pass.passIdentifier}"></div>
        </div>
    `).join('');

    // Generate QR codes for each pass
    passes.forEach(pass => {
        new QRCode(document.getElementById(`qr-${pass.passIdentifier}`), {
            text: pass.passIdentifier,
            width: 128,
            height: 128
        });
    });
}

// Make functions globally available
window.generatePasses = generatePasses;
window.togglePassesView = function(view) {
    document.querySelectorAll('.passes-section').forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById(`${view}PassesSection`).style.display = 'block';
    
    document.querySelectorAll('.passes-toggle .toggle-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.toggle-btn[onclick*="${view}"]`).classList.add('active');
};

// Add cleanup verification function
function cleanupVerification() {
    if (window.html5QrcodeScanner) {
        window.html5QrcodeScanner.clear();
        window.html5QrcodeScanner = null;
    }
    // Reset verification result display
    const resultDiv = document.getElementById('verificationResult');
    if (resultDiv) {
        resultDiv.style.display = 'none';
    }
    // Reset manual input
    const ticketInput = document.getElementById('ticketIdInput');
    if (ticketInput) {
        ticketInput.value = '';
    }
}

// Update switchVerificationMethod function
function switchVerificationMethod(method) {
    try {
        // Stop QR scanner if it's running
        if (window.html5QrcodeScanner) {
            window.html5QrcodeScanner.clear();
            window.html5QrcodeScanner = null;
        }

        // Get all elements
        const tabButtons = document.querySelectorAll('.verification-tabs .tab-btn');
        const verificationMethods = document.querySelectorAll('.verification-method');
        const activeButton = document.querySelector(`.tab-btn[onclick*="'${method}'"]`);
        const activeMethod = document.getElementById(`${method}Verification`);
        const scanButton = document.querySelector('.scan-btn');
        const stopButton = document.querySelector('[onclick="stopQRScanner()"]');

        // Update tab buttons
        tabButtons.forEach(btn => btn.classList.remove('active'));
        if (activeButton) {
            activeButton.classList.add('active');
        }

        // Update verification methods display
        verificationMethods.forEach(el => {
            if (el) el.style.display = 'none';
        });
        if (activeMethod) {
            activeMethod.style.display = 'block';
        }

        // Handle QR scanner specific elements
        if (method === 'qr') {
            window.initQRScanner();
            if (scanButton) scanButton.style.display = 'block';
            if (stopButton) stopButton.style.display = 'none';
        }
    } catch (error) {
        console.error("Error switching verification method:", error);
    }
}

// Make functions globally available
window.cleanupVerification = cleanupVerification;
window.switchVerificationMethod = switchVerificationMethod;

// Add a variable to store the current ticket ID
let currentTicketId = null;

// Update showVerificationResult to store the ticket ID
window.showVerificationResult = function(result) {
    const resultDiv = document.getElementById('verificationResult');
    const statusSpan = resultDiv.querySelector('.result-status');
    const detailsDiv = resultDiv.querySelector('.ticket-details');
    const markUsedBtn = resultDiv.querySelector('.mark-used-btn');

    // Store the identifier (either ticket or pass)
    currentTicketId = result.ticket?.ticketIdentifier || result.pass?.passIdentifier || null;

    statusSpan.className = 'result-status ' + result.status;
    statusSpan.textContent = result.message;

    if ((result.ticket || result.pass) && result.event) {
        const item = result.ticket || result.pass;
        detailsDiv.innerHTML = `
            <h4>${result.ticket ? 'Ticket' : 'Pass'} Information</h4>
            <p><strong>ID:</strong> ${item.ticketIdentifier || item.passIdentifier}</p>
            <p><strong>Event:</strong> ${result.event.name}</p>
            <p><strong>Event Date:</strong> ${new Date(result.event.date).toLocaleString()}</p>
            ${result.ticket ? `
                <p><strong>Ticket Type:</strong> ${result.ticket.ticketType || 'Standard'}</p>
                <p><strong>Purchase Date:</strong> ${new Date(result.ticket.purchaseDate).toLocaleString()}</p>
                <p><strong>Purchased By:</strong> ${result.ticket.userEmail}</p>
            ` : `
                <p><strong>Pass Role:</strong> ${result.pass.role}</p>
                <p><strong>Created:</strong> ${new Date(result.pass.createdAt.toDate()).toLocaleString()}</p>
            `}
        `;
        markUsedBtn.style.display = result.status === 'valid' ? 'block' : 'none';
    } else {
        detailsDiv.innerHTML = '';
        markUsedBtn.style.display = 'none';
    }

    resultDiv.style.display = 'block';
};

// Update markTicketAsUsed to use the stored ticket ID
async function markTicketAsUsed() {
    try {
        if (!currentTicketId) {
            throw new Error('No valid ticket/pass selected');
        }
        
        // First try to find and update ticket
        const ticketsRef = collection(db, 'tickets');
        const ticketQuery = query(ticketsRef, where('ticketIdentifier', '==', currentTicketId));
        const ticketSnapshot = await getDocs(ticketQuery);

        if (!ticketSnapshot.empty) {
            const ticketDoc = ticketSnapshot.docs[0];
            await updateDoc(ticketDoc.ref, {
                used: true,
                usedDate: new Date().toISOString()
            });
            alert('Ticket marked as used successfully!');
        } else {
            // If not found in tickets, try passes
            const passesRef = collection(db, 'passes');
            const passQuery = query(passesRef, where('passIdentifier', '==', currentTicketId));
            const passSnapshot = await getDocs(passQuery);

            if (!passSnapshot.empty) {
                const passDoc = passSnapshot.docs[0];
                await updateDoc(passDoc.ref, {
                    used: true,
                    usedDate: serverTimestamp()
                });
                alert('Pass marked as used successfully!');
            } else {
                throw new Error('Ticket/Pass not found');
            }
        }

        document.getElementById('verificationResult').style.display = 'none';
        currentTicketId = null; // Reset the current ticket/pass ID
        
    } catch (error) {
        console.error("Error marking ticket/pass as used:", error);
        alert('Error marking ticket/pass as used: ' + error.message);
    }
}

// Add verify ticket function
async function verifyTicket(identifier) {
    try {
        // First check tickets collection
        const ticketsRef = collection(db, 'tickets');
        const ticketQuery = query(ticketsRef, where('ticketIdentifier', '==', identifier));
        const ticketSnapshot = await getDocs(ticketQuery);

        // If found in tickets
        if (!ticketSnapshot.empty) {
            const ticketDoc = ticketSnapshot.docs[0];
            const ticket = ticketDoc.data();

            // Get event details
            const eventDoc = await getDoc(doc(db, 'events', ticket.eventId));
            if (!eventDoc.exists()) {
                return {
                    status: 'invalid',
                    message: 'Event not found',
                    ticket,
                    event: null
                };
            }

            const event = eventDoc.data();
            const now = new Date();
            const eventDate = new Date(event.date);

            if (ticket.used) {
                return {
                    status: 'used',
                    message: 'Ticket already used',
                    ticket,
                    event
                };
            }

            if (eventDate < now) {
                return {
                    status: 'expired',
                    message: 'Event has ended',
                    ticket,
                    event
                };
            }

            return {
                status: 'valid',
                message: 'Valid Ticket',
                ticket,
                event
            };
        }

        // If not found in tickets, check passes collection
        const passesRef = collection(db, 'passes');
        const passQuery = query(passesRef, where('passIdentifier', '==', identifier));
        const passSnapshot = await getDocs(passQuery);

        // If found in passes
        if (!passSnapshot.empty) {
            const passDoc = passSnapshot.docs[0];
            const pass = passDoc.data();

            // Get event details
            const eventDoc = await getDoc(doc(db, 'events', pass.eventId));
            if (!eventDoc.exists()) {
                return {
                    status: 'invalid',
                    message: 'Event not found',
                    pass,
                    event: null
                };
            }

            const event = eventDoc.data();

            if (pass.used) {
                return {
                    status: 'used',
                    message: 'Pass already used',
                    pass,
                    event
                };
            }

            return {
                status: 'valid',
                message: 'Valid Pass',
                pass,
                event
            };
        }

        // If not found in either collection
        return {
            status: 'invalid',
            message: 'Invalid Ticket/Pass',
            ticket: null,
            pass: null,
            event: null
        };

    } catch (error) {
        console.error("Error verifying ticket/pass:", error);
        return {
            status: 'error',
            message: 'Error verifying ticket/pass',
            ticket: null,
            pass: null,
            event: null
        };
    }
}

// Make functions globally available
window.verifyTicket = verifyTicket;
window.markTicketAsUsed = markTicketAsUsed;
async function getRealTimeAvailability(eventId, ticketType) {
    try {
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        if (!eventDoc.exists()) {
            throw new Error('Event not found');
        }
        const event = eventDoc.data();

        // Get all sold tickets
        const ticketsRef = collection(db, 'tickets');
        const ticketQuery = query(ticketsRef, 
            where('eventId', '==', eventId),
            where('ticketType', '==', ticketType),
            where('paymentStatus', '==', 'completed')
        );
        const ticketSnapshot = await getDocs(ticketQuery);

        // Calculate total sold tickets
        let soldTickets = 0;
        ticketSnapshot.forEach(doc => {
            const ticket = doc.data();
            soldTickets += Number(ticket.ticketCount) || 0;
        });

        // Get total and available tickets based on event type
        let totalTickets = 0;
        let availableTickets = 0;

        if (event.eventType === 'hybrid') {
            if (ticketType === 'venue') {
                totalTickets = event.tickets.venue.total;
                availableTickets = event.tickets.venue.available;
            } else {
                totalTickets = event.tickets.online.total;
                availableTickets = event.tickets.online.available;
            }
        } else {
            totalTickets = event.totalTickets;
            availableTickets = event.availableTickets;
        }

        return {
            total: totalTickets,
            sold: soldTickets,
            available: availableTickets // Use the stored available count instead of calculating
        };
    } catch (error) {
        console.error('Error getting ticket availability:', error);
        throw error;
    }
}

// Function to update ticket type options based on selected event
async function updateTicketTypeOptions() {
    console.log('Updating ticket type options...');
    const eventId = document.getElementById('ticketEventSelector').value;
    const typeSelector = document.getElementById('ticketTypeSelector');
    const paymentModeSection = document.getElementById('paymentMode')?.parentElement;
    const paymentMode = document.getElementById('paymentMode');
    
    if (!eventId || !typeSelector) return;
    
    // Clear existing options
    typeSelector.innerHTML = '<option value="">Select Ticket Type</option>';
    
    try {
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        const event = eventDoc.data();
        
        const isFreeEvent = event.pricingType === 'free' || event.price === 0;
        
        if (paymentModeSection && paymentMode) {
            paymentModeSection.style.display = isFreeEvent ? 'none' : 'block';
            if (isFreeEvent) {
                paymentMode.value = 'free';
                paymentMode.removeAttribute('required'); // Remove required attribute for free events
            } else {
                paymentMode.value = ''; // Reset payment mode
                paymentMode.setAttribute('required', 'required'); // Make required for paid events
            }
        }

        if (event.eventType === 'hybrid') {
            // Get real-time availability for both types
            const venueAvailability = await getRealTimeAvailability(eventId, 'venue');
            const onlineAvailability = await getRealTimeAvailability(eventId, 'online');
            
            console.log('Current availability:', {
                venue: venueAvailability,
                online: onlineAvailability
            });

            // Add venue option if available
            if (venueAvailability.available > 0) {
                typeSelector.innerHTML += `
                    <option value="venue">
                        Venue Ticket (${isFreeEvent ? 'Free' : '₹' + event.tickets.venue.price}) 
                        - ${venueAvailability.available} available
                    </option>
                `;
            }
            
            // Add online option if available
            if (onlineAvailability.available > 0) {
                typeSelector.innerHTML += `
                    <option value="online">
                        Online Ticket (${isFreeEvent ? 'Free' : '₹' + event.tickets.online.price}) 
                        - ${onlineAvailability.available} available
                    </option>
                `;
            }
        } else {
            // For standard events
            const availability = await getRealTimeAvailability(eventId, 'standard');
            console.log('Current availability:', availability);

            if (availability.available > 0) {
                typeSelector.innerHTML += `
                    <option value="standard">
                        Standard Ticket (${isFreeEvent ? 'Free' : '₹' + event.price}) 
                        - ${availability.available} available
                    </option>
                `;
            }
        }

        // Update price display
        updateTicketPrice();

    } catch (error) {
        console.error("Error updating ticket options:", error);
    }
}
// Function to update ticket price display
function updateTicketPrice() {
    const quantity = parseInt(document.getElementById('ticketQuantity').value) || 0;
    const typeSelector = document.getElementById('ticketTypeSelector');
    const selectedOption = typeSelector.options[typeSelector.selectedIndex];
    
    let pricePerTicket = 0;
    if (selectedOption && selectedOption.text) {
        // Check if it's a free ticket
        if (selectedOption.text.includes('Free')) {
            pricePerTicket = 0;
        } else {
            // Extract price only if it's a paid ticket
            const priceMatch = selectedOption.text.match(/₹(\d+)/);
            pricePerTicket = priceMatch ? parseInt(priceMatch[1]) : 0;
        }
    }
    
    const totalPrice = pricePerTicket * quantity;
    
    document.getElementById('pricePerTicket').textContent = pricePerTicket === 0 ? 'Free' : `₹${pricePerTicket}`;
    document.getElementById('totalTicketPrice').textContent = totalPrice === 0 ? 'Free' : `₹${totalPrice}`;
}

// Function to generate ticket for user
async function generateTicketForUser() {
    try {
        const eventId = document.getElementById('ticketEventSelector').value;
        const ticketType = document.getElementById('ticketTypeSelector').value;
        const quantity = parseInt(document.getElementById('ticketQuantity').value);
        const userEmail = document.getElementById('ticketUserEmail').value.trim();
        const paymentMode = document.getElementById('paymentMode').value;

        // Validate inputs
        if (!eventId || !ticketType || !quantity || !userEmail) {
            const missingFields = [];
            if (!eventId) missingFields.push('Event');
            if (!ticketType) missingFields.push('Ticket Type');
            if (!quantity) missingFields.push('Quantity');
            if (!userEmail) missingFields.push('Email');
            
            alert(`Please fill in the following fields: ${missingFields.join(', ')}`);
            return;
        }

        // Get event details to check if it's a free event
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        if (!eventDoc.exists()) {
            throw new Error('Event not found');
        }

        const event = eventDoc.data();
        const isFreeEvent = event.pricingType === 'free' || event.price === 0;

        // Validate payment mode for paid events
        if (!isFreeEvent && !paymentMode) {
            alert('Please select a payment mode');
            return;
        }

        // Check real-time availability
        const availability = await getRealTimeAvailability(eventId, ticketType);
        if (quantity > availability.available) {
            throw new Error(`Only ${availability.available} tickets available`);
        }

        // For paid events, handle payment
        if (!isFreeEvent && paymentMode === 'card') {
            showCardDetailsModal();
            return;
        }

        // Show loader for cash/free payments
        const generateBtn = document.querySelector('#generateTicket button[onclick="generateTicketForUser()"]');
        const originalBtnText = generateBtn.innerHTML;
        generateBtn.disabled = true;
        generateBtn.innerHTML = `
            <span class="spinner"></span>
            Generating ticket...
        `;

        // Add loader styles if not already present
        if (!document.getElementById('loaderStyles')) {
            const style = document.createElement('style');
            style.id = 'loaderStyles';
            style.textContent = `
                .spinner {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid #ffffff;
                    border-top: 2px solid transparent;
                    border-radius: 50%;
                    margin-right: 8px;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        try {
            // Process ticket generation
            await processTicketGeneration(false);
            alert('Ticket generated successfully!');
        } finally {
            // Reset button state
            generateBtn.disabled = false;
            generateBtn.innerHTML = originalBtnText;
        }

    } catch (error) {
        console.error("Error generating ticket:", error);
        alert('Error generating ticket: ' + error.message);
        
        // Reset button if error occurs
        const generateBtn = document.querySelector('#generateTicket button[onclick="generateTicketForUser()"]');
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = 'Generate Ticket';
        }
    }
}

// Add function to update ticket stats
// Update the updateTicketStats function to handle filtered tickets

async function updateTicketStats(selectedEventId = null) {
    try {
        const ticketsRef = collection(db, 'tickets');
        const eventsRef = collection(db, 'events');
        
        // Get event data first
        let eventCapacity = 0;
        if (selectedEventId && selectedEventId !== 'all') {
            const eventDoc = await getDoc(doc(eventsRef, selectedEventId));
            if (eventDoc.exists()) {
                const eventData = eventDoc.data();
                if (eventData.eventType === 'hybrid') {
                    eventCapacity = (parseInt(eventData.tickets?.venue?.total) || 0) + 
                                  (parseInt(eventData.tickets?.online?.total) || 0);
                } else {
                    eventCapacity = parseInt(eventData.totalTickets) || 0;
                }
            }
        } else {
            // If no event selected, sum up capacity of all events
            const eventsSnapshot = await getDocs(eventsRef);
            eventsSnapshot.forEach(doc => {
                const event = doc.data();
                if (!event.deleted && event.status !== 'deleted') {
                    if (event.eventType === 'hybrid') {
                        eventCapacity += (parseInt(event.tickets?.venue?.total) || 0) + 
                                       (parseInt(event.tickets?.online?.total) || 0);
                    } else {
                        eventCapacity += parseInt(event.totalTickets) || 0;
                    }
                }
            });
        }

        // Build ticket query
        let ticketQuery;
        if (selectedEventId && selectedEventId !== 'all') {
            ticketQuery = query(ticketsRef, where('eventId', '==', selectedEventId));
        } else {
            ticketQuery = query(ticketsRef);
        }

        const ticketSnapshot = await getDocs(ticketQuery);
        
        let stats = {
            totalTickets: eventCapacity,
            ticketsSold: 0,
            ticketsScanned: 0,
            totalRevenue: 0
        };

        // Calculate ticket stats
        ticketSnapshot.forEach(doc => {
            const ticket = doc.data();
            if (ticket.paymentStatus === 'completed') {
                const ticketCount = parseInt(ticket.ticketCount) || 1;
                stats.ticketsSold += ticketCount;
                stats.totalRevenue += parseFloat(ticket.totalPrice) || 0;
                
                if (ticket.used) {
                    stats.ticketsScanned += ticketCount;
                }
            }
        });

        // Calculate available tickets
        stats.availableTickets = Math.max(0, stats.totalTickets - stats.ticketsSold);

        // Update ticket section UI elements
        const ticketElements = {
            totalTickets: document.getElementById('adminTotalTickets'),
            soldTickets: document.getElementById('adminSoldTickets'),
            availableTickets: document.getElementById('adminAvailableTickets'),
            usedTickets: document.getElementById('selectedEventUsedTickets'),
            revenue: document.getElementById('selectedEventTotalRevenue')
        };

        // Update elements if they exist
        if (ticketElements.totalTickets) ticketElements.totalTickets.textContent = stats.totalTickets;
        if (ticketElements.soldTickets) ticketElements.soldTickets.textContent = stats.ticketsSold;
        if (ticketElements.availableTickets) ticketElements.availableTickets.textContent = stats.availableTickets;
        if (ticketElements.usedTickets) ticketElements.usedTickets.textContent = stats.ticketsScanned;
        if (ticketElements.revenue) ticketElements.revenue.textContent = formatCurrency(stats.totalRevenue);

        console.log('Ticket Page Stats:', stats);

    } catch (error) {
        console.error('Error updating ticket stats:', error);
    }
}

// Add event listeners for filters
document.addEventListener('DOMContentLoaded', () => {
    const eventSelector = document.getElementById('adminEventSelector');
    const searchInput = document.getElementById('adminTicketSearch');

    if (eventSelector) {
        eventSelector.addEventListener('change', () => {
            updateTicketStats(eventSelector.value);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            const selectedEventId = eventSelector?.value || 'all';
            updateTicketStats(selectedEventId);
        }, 300));
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const eventSelector = document.getElementById('adminEventSelector');
    const searchInput = document.getElementById('adminTicketSearch');

    if (eventSelector) {
        eventSelector.addEventListener('change', () => {
            updateTicketStats(eventSelector.value);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            updateTicketStats(eventSelector?.value);
        }, 300));
    }

    // Initial load
    updateTicketStats('all');
});
// Helper function to clear ticket stats
// Helper function to clear ticket stats
function clearTicketStats() {
    const elements = {
        totalTickets: document.getElementById('selectedEventTotalTickets'),
        soldTickets: document.getElementById('selectedEventSoldTickets'),
        usedTickets: document.getElementById('selectedEventUsedTickets'),
        availableTickets: document.getElementById('selectedEventAvailableTickets'),
        totalRevenue: document.getElementById('selectedEventTotalRevenue')
    };

    // Only update elements that exist
    if (elements.totalTickets) elements.totalTickets.textContent = '0';
    if (elements.soldTickets) elements.soldTickets.textContent = '0';
    if (elements.usedTickets) elements.usedTickets.textContent = '0';
    if (elements.availableTickets) elements.availableTickets.textContent = '0';
    if (elements.totalRevenue) elements.totalRevenue.textContent = '₹0';
}

// Helper function for currency formatting
function formatCurrency(amount) {
    return '₹' + amount.toLocaleString('en-IN');
}

// Make functions globally available
window.closeCardModal = closeCardModal;
window.processCardPayment = processCardPayment;
window.updateTicketStats = updateTicketStats;
// Function to collect payment
async function collectPayment() {
    try {
        const ticketId = document.getElementById('paymentTicketId').value;
        const amount = parseFloat(document.getElementById('paymentAmount').value);
        const method = document.getElementById('paymentMethod').value;
        
        if (!ticketId || !amount || !method) {
            alert('Please fill in all fields');
            return;
        }
        
        const ticketsRef = collection(db, 'tickets');
        const q = query(ticketsRef, where('ticketIdentifier', '==', ticketId));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            alert('Ticket not found');
            return;
        }
        
        const ticketDoc = querySnapshot.docs[0];
        await updateDoc(ticketDoc.ref, {
            paymentStatus: 'completed',
            paymentMethod: method,
            paymentDate: new Date().toISOString()
        });
        
        alert('Payment collected successfully!');
        
    } catch (error) {
        console.error("Error collecting payment:", error);
        alert('Error collecting payment: ' + error.message);
    }
}

// Make functions globally available
window.generateTicketForUser = generateTicketForUser;
window.updateTicketTypeOptions = updateTicketTypeOptions;
window.updateTicketPrice = updateTicketPrice;
window.collectPayment = collectPayment;

// Add event listeners
document.getElementById('ticketQuantity').addEventListener('input', updateTicketPrice);
document.getElementById('ticketTypeSelector').addEventListener('change', updateTicketPrice);

// Update loadAllPasses function with improved filtering
async function loadAllPasses(roleFilter = 'all', eventFilter = 'all') {
    try {
        const passesRef = collection(db, 'passes');
        const container = document.getElementById('viewPassesList');
        if (!container) {
            console.error('Passes list container not found');
            return;
        }

        // Create filters section if it doesn't exist
        let filtersSection = document.getElementById('passes-filters');
        if (!filtersSection) {
            filtersSection = document.createElement('div');
            filtersSection.id = 'passes-filters';
            filtersSection.className = 'filters-section';
            container.parentNode.insertBefore(filtersSection, container);
        }

        // Update filters UI
        filtersSection.innerHTML = `
            <div class="filter-controls">
                <select id="role-filter" class="filter-select">
                    <option value="all">All Roles</option>
                    <option value="staff">Staff</option>
                    <option value="vip">VIP</option>
                    <option value="media">Media</option>
                    <option value="other">Other Roles</option>
                    <option value="used">Used Passes</option>
                    <option value="unused">Unused Passes</option>
                </select>

                <select id="event-filter" class="filter-select">
                    <option value="all">All Events</option>
                    <!-- Events will be populated dynamically -->
                </select>
            </div>
        `;

        // Populate event filter
        const eventSelect = document.getElementById('event-filter');
        const eventsSnapshot = await getDocs(collection(db, 'events'));
        eventsSnapshot.forEach(doc => {
            const event = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = event.name;
            eventSelect.appendChild(option);
        });

        // Set filter values if they exist
        if (roleFilter !== 'all') {
            document.getElementById('role-filter').value = roleFilter;
        }
        if (eventFilter !== 'all') {
            document.getElementById('event-filter').value = eventFilter;
        }

        // Add filter event listeners
        document.getElementById('role-filter').addEventListener('change', function() {
            loadAllPasses(this.value, document.getElementById('event-filter').value);
        });

        document.getElementById('event-filter').addEventListener('change', function() {
            loadAllPasses(document.getElementById('role-filter').value, this.value);
        });

        // Build query based on filters
        let q = passesRef;
        const conditions = [];

        if (roleFilter !== 'all') {
            if (roleFilter === 'used') {
                conditions.push(where('used', '==', true));
            } else if (roleFilter === 'unused') {
                conditions.push(where('used', '==', false));
            } else if (roleFilter === 'other') {
                // Filter for roles that are not in the standard roles list
                conditions.push(where('role', 'not-in', ['staff', 'vip', 'media']));
            } else {
                conditions.push(where('role', '==', roleFilter));
            }
        }

        if (eventFilter !== 'all') {
            conditions.push(where('eventId', '==', eventFilter));
        }

        if (conditions.length > 0) {
            q = query(passesRef, ...conditions);
        }

        // Get passes
        const passesSnapshot = await getDocs(q);
        
        // Clear and setup container
        container.innerHTML = `
            <div class="passes-actions">
                <button onclick="downloadSelectedPasses()" class="bulk-action-btn">
                    <i class="fas fa-download"></i> Download Selected
                </button>
                <button onclick="deleteSelectedPasses()" class="bulk-action-btn">
                    <i class="fas fa-trash"></i> Delete Selected
                </button>
            </div>
            <div class="passes-list"></div>
        `;

        const passesList = container.querySelector('.passes-list');

        // Display passes
        if (passesSnapshot.empty) {
            passesList.innerHTML = '<p class="no-results">No passes found</p>';
            return;
        }

        passesSnapshot.forEach(doc => {
            const pass = doc.data();
            const passElement = document.createElement('div');
            passElement.className = 'pass-item';
            passElement.innerHTML = `
                <div class="pass-checkbox">
                    <input type="checkbox" class="pass-select" data-pass-id="${doc.id}">
                </div>
                <div class="pass-details">
                    <p><strong>Pass ID:</strong> ${pass.passIdentifier}</p>
                    <p><strong>Role:</strong> ${pass.role}</p>
                    <p><strong>Event:</strong> <span id="event-${doc.id}">Loading...</span></p>
                    <p><strong>Status:</strong> ${pass.used ? 'Used' : 'Unused'}</p>
                    <p><strong>Created:</strong> ${pass.createdAt.toDate().toLocaleString()}</p>
                </div>
                <div class="pass-actions">
                    <button onclick="downloadPass('${doc.id}')" class="action-btn">
                        <i class="fas fa-download"></i> Download
                    </button>
                    <button onclick="deletePass('${doc.id}')" class="action-btn">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            passesList.appendChild(passElement);

            // Fetch and display event name
            fetchEventName(pass.eventId, `event-${doc.id}`);
        });

    } catch (error) {
        console.error("Error loading passes:", error);
        alert('Error loading passes: ' + error.message);
    }
}

// Function to download a single pass
async function downloadPass(passId) {
    const downloadBtn = document.querySelector(`button[onclick="downloadPass('${passId}')"]`);
    if (!downloadBtn) return;

    try {
        // Update button state
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

        // Get pass data
        const passDoc = await getDoc(doc(db, 'passes', passId));
        if (!passDoc.exists()) throw new Error('Pass not found');
        const pass = passDoc.data();

        // Get event data
        const eventDoc = await getDoc(doc(db, 'events', pass.eventId));
        if (!eventDoc.exists()) throw new Error('Event not found');
        const eventName = eventDoc.data().name;

        // Create a temporary div for QR code
        const qrContainer = document.createElement('div');
        document.body.appendChild(qrContainer);

        // Generate QR code
        const qr = new QRCode(qrContainer, {
            text: pass.passIdentifier,
            width: 128,
            height: 128
        });

        // Wait for QR code to generate
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get QR code as image
        const qrImage = qrContainer.querySelector('img');
        const qrData = qrImage.src;

        // Create PDF
        const PDF = window.jspdf.jsPDF;
        const pdf = new PDF();
        
        // Add content to PDF
        pdf.setFontSize(20);
        pdf.text('EventTix Pass', 105, 20, { align: 'center' });
        
        pdf.setFontSize(16);
        pdf.text(pass.role.toUpperCase(), 105, 40, { align: 'center' });
        
        pdf.setFontSize(12);
        pdf.text([
            `Pass ID: ${pass.passIdentifier}`,
            `Event: ${eventName}`,
            `Role: ${pass.role}`,
            `Created: ${new Date(pass.createdAt.toDate()).toLocaleDateString()}`
        ], 20, 60);

        // Add QR code to PDF
        pdf.addImage(qrData, 'PNG', 70, 100, 70, 70);

        // Add footer
        pdf.setFontSize(10);
        pdf.setTextColor(220, 53, 69); // Red color
        pdf.text('AUTHORIZED ACCESS ONLY', 105, 200, { align: 'center' });

        // Save the PDF
        pdf.save(`Pass-${pass.passIdentifier}.pdf`);

        // Cleanup
        document.body.removeChild(qrContainer);

    } catch (error) {
        console.error('Error in downloadPass:', error);
        alert('Failed to generate pass: ' + error.message);
    } finally {
        // Reset button state
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
        }
    }
}

// Update downloadCanvas function with better error handling
async function downloadCanvas(canvas, filename) {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error('Failed to create image blob'));
                    return;
                }
                
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                
                // Trigger download
                link.click();
                
                // Cleanup
                setTimeout(() => {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    resolve();
                }, 100);
                
            }, 'image/png', 1.0);
        } catch (error) {
            reject(error);
        }
    });
}

// Update createPassTemplate function to ensure all elements are properly styled
function createPassTemplate(pass, eventName) {
    const div = document.createElement('div');
    div.style.cssText = `
        width: 500px;
        padding: 40px;
        background: white;
        font-family: Arial, sans-serif;
        position: fixed;
        left: -9999px;
        top: -9999px;
        z-index: -1;
        border: 1px solid #ddd;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    
    div.innerHTML = `
        <div style="text-align: center; background: white;">
            <h2 style="margin: 0 0 20px 0; color: #333; font-size: 24px;">EventTix Pass</h2>
            <div style="background: #4a90e2; color: white; padding: 10px; margin: 20px 0; font-size: 18px;">
                ${pass.role.toUpperCase()}
            </div>
            <div class="qr-container" style="margin: 20px auto; width: 150px; height: 150px; background: white;"></div>
            <div style="text-align: left; margin: 20px 0;">
                <p style="margin: 10px 0; font-size: 14px;"><strong>Pass ID:</strong> ${pass.passIdentifier}</p>
                <p style="margin: 10px 0; font-size: 14px;"><strong>Event:</strong> ${eventName}</p>
                <p style="margin: 10px 0; font-size: 14px;"><strong>Role:</strong> ${pass.role}</p>
                <p style="margin: 10px 0; font-size: 14px;"><strong>Created:</strong> ${new Date(pass.createdAt.toDate()).toLocaleDateString()}</p>
            </div>
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                <p style="color: #dc3545; font-weight: bold; font-size: 16px;">AUTHORIZED ACCESS ONLY</p>
            </div>
        </div>
    `;
    
    return div;
}

async function generateQRCode(text, container) {
    return new Promise((resolve, reject) => {
        try {
            new QRCode(container, {
                text: text,
                width: 150,
                height: 150,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            setTimeout(resolve, 1000); // Wait for render
        } catch (error) {
            reject(error);
        }
    });
}

function cleanupElements(elements) {
    Object.values(elements).forEach(element => {
        if (element && document.body.contains(element)) {
            document.body.removeChild(element);
        }
    });
}

// Function to download multiple passes
async function downloadSelectedPasses() {
    const selectedCheckboxes = document.querySelectorAll('.pass-select:checked');
    
    if (selectedCheckboxes.length === 0) {
        alert('Please select at least one pass to download');
        return;
    }

    let downloaded = 0;
    let failed = 0;

    for (const checkbox of selectedCheckboxes) {
        try {
            await downloadPass(checkbox.dataset.passId);
            downloaded++;
            // Add delay between downloads
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error('Error downloading pass:', error);
            failed++;
        }
    }

    // Show summary
    if (failed > 0) {
        alert(`Downloaded ${downloaded} passes. Failed to download ${failed} passes.`);
    } else {
        alert(`Successfully downloaded ${downloaded} passes!`);
    }
}

// Make functions available globally
window.downloadPass = downloadPass;
window.downloadSelectedPasses = downloadSelectedPasses;

// Add function to delete selected passes
async function deleteSelectedPasses() {
    const selectedPasses = document.querySelectorAll('.pass-select:checked');
    if (selectedPasses.length === 0) {
        alert('Please select at least one pass to delete');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedPasses.length} passes?`)) {
        return;
    }

    try {
        const batch = writeBatch(db);
        selectedPasses.forEach(checkbox => {
            const passId = checkbox.dataset.passId;
            batch.delete(doc(db, 'passes', passId));
        });

        await batch.commit();
        await loadPassesStats();
        
        // Get current filter values from the actual filter elements
        const roleFilter = document.getElementById('role-filter')?.value || 'all';
        const eventFilter = document.getElementById('event-filter')?.value || 'all';
        
        // Reload passes with current filters
        await loadAllPasses(roleFilter, eventFilter);
        
        alert('Selected passes deleted successfully');
    } catch (error) {
        console.error("Error deleting passes:", error);
        alert('Error deleting passes: ' + error.message);
    }
}

// Update setupPassSearch function
function setupPassSearch() {
    const searchInput = document.getElementById('passSearchInput');
    const filterSelector = document.getElementById('passFilterSelector');
    
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            loadAllPasses(filterSelector.value, searchInput.value);
        }, 300));
    }

    if (filterSelector) {
        filterSelector.addEventListener('change', () => {
            loadAllPasses(filterSelector.value, searchInput?.value || '');
        });
    }
}

// Make sure to export all necessary functions
window.deletePass = deletePass;
window.deleteSelectedPasses = deleteSelectedPasses;
window.toggleAllPasses = toggleAllPasses;

// Add function to fetch event name
async function fetchEventName(eventId, elementId) {
    try {
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        if (eventDoc.exists()) {
            const eventName = eventDoc.data().name;
            document.getElementById(elementId).textContent = eventName;
        }
    } catch (error) {
        console.error("Error fetching event name:", error);
    }
}

// Add function to toggle pass status
async function togglePassStatus(passId, newStatus) {
    try {
        await updateDoc(doc(db, 'passes', passId), {
            used: newStatus,
            usedDate: newStatus ? serverTimestamp() : null
        });
        await loadPassesStats();
        await loadAllPasses(
            document.getElementById('passFilterSelector').value,
            document.getElementById('passSearchInput').value
        );
    } catch (error) {
        console.error("Error updating pass status:", error);
        alert('Error updating pass status: ' + error.message);
    }
}

// Add debounce utility function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Make new functions globally available
window.togglePassStatus = togglePassStatus;
window.setupPassSearch = setupPassSearch;

// Add initialization code
document.addEventListener('DOMContentLoaded', () => {
    // Initialize event selector for passes
    const passesEventSelector = document.getElementById('eventSelectorForPasses');
    if (passesEventSelector) {
        populateEventSelector('eventSelectorForPasses');
    }

    // Initialize role selector
    const roleSelector = document.getElementById('roleSelector');
    if (roleSelector) {
        roleSelector.addEventListener('change', function() {
            const otherRoleInput = document.getElementById('otherRoleInput');
            if (otherRoleInput) {
                otherRoleInput.style.display = this.value === 'other' ? 'block' : 'none';
            }
        });
    }

    // Initialize passes view
    loadPassesStats();
    loadAllPasses();
});

// Make functions globally available
window.generatePasses = generatePasses;
window.populateEventSelector = populateEventSelector;
window.loadPassesStats = loadPassesStats;
window.loadAllPasses = loadAllPasses;

// Add deletePass function
async function deletePass(passId) {
    try {
        if (!confirm('Are you sure you want to delete this pass?')) {
            return;
        }

        await deleteDoc(doc(db, 'passes', passId));
        await loadPassesStats();
        
        // Get current filter values
        const roleFilter = document.getElementById('role-filter')?.value || 'all';
        const eventFilter = document.getElementById('event-filter')?.value || 'all';
        
        // Reload passes with current filters
        await loadAllPasses(roleFilter, eventFilter);
        
        alert('Pass deleted successfully');
    } catch (error) {
        console.error("Error deleting pass:", error);
        alert('Error deleting pass: ' + error.message);
    }
}

// Add toggle all passes function
function toggleAllPasses(checked) {
    document.querySelectorAll('.pass-select').forEach(checkbox => {
        checkbox.checked = checked;
    });
}

// Make new functions globally available
window.deletePass = deletePass;
window.toggleAllPasses = toggleAllPasses;

// Add some CSS to style the filters
const style = document.createElement('style');
style.textContent = `
    .filters-section {
        margin-bottom: 20px;
        padding: 15px;
        background: #f5f5f5;
        border-radius: 5px;
    }

    .filter-controls {
        display: flex;
        gap: 15px;
        align-items: center;
    }

    .filter-select {
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        min-width: 150px;
    }

    .filter-select:focus {
        outline: none;
        border-color: #007bff;
    }
`;
document.head.appendChild(style);



// ... existing code ...

// Add event listeners when document loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize event selector for tickets
    const ticketEventSelector = document.getElementById('ticketEventSelector');
    if (ticketEventSelector) {
        ticketEventSelector.addEventListener('change', updateTicketTypeOptions);
        populateEventSelector('ticketEventSelector');
    }

    // Add listeners for ticket quantity and type
    const ticketQuantity = document.getElementById('ticketQuantity');
    if (ticketQuantity) {
        ticketQuantity.addEventListener('input', updateTicketPrice);
    }

    const ticketTypeSelector = document.getElementById('ticketTypeSelector');
    if (ticketTypeSelector) {
        ticketTypeSelector.addEventListener('change', updateTicketPrice);
    }
});

// Make functions globally available

window.updateTicketTypeOptions = updateTicketTypeOptions;
window.updateTicketPrice = updateTicketPrice;






// Function to show card details modal
function showCardDetailsModal() {
    // Create modal HTML with unique ID and additional fields
    const modalHTML = `
        <div id="ticketCardDetailsModal" class="modal">
            <div class="modal-content">
                <span class="close" onclick="closeCardModal()">&times;</span>
                <h3>Enter Card Details</h3>
                <div class="form-group">
                    <label>Card Number</label>
                    <input type="text" id="cardNumber" maxlength="16" placeholder="Enter 16-digit card number">
                    <small class="helper-text">Enter 16-digit number without spaces</small>
                </div>
                <div class="form-group">
                    <label>Name on Card</label>
                    <input type="text" id="cardName" placeholder="Enter name as shown on card">
                </div>
                <div class="card-extra-details">
                    <div class="form-group expiry-date">
                        <label>Expiry Date</label>
                        <input type="text" id="cardExpiry" maxlength="5" placeholder="MM/YY">
                        <small class="helper-text">Format: MM/YY (e.g., 12/26)</small>
                    </div>
                    <div class="form-group cvv">
                        <label>CVV</label>
                        <input type="password" id="cardCvv" maxlength="3" placeholder="***">
                        <small class="helper-text">3-digit security code</small>
                    </div>
                </div>
                <button onclick="processCardPayment()" class="pay-now-btn">Pay Now</button>
                <div class="loader" style="display: none;">Processing payment...</div>
            </div>
        </div>
    `;

    // Add modal to document
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add modal styles
    const modalStyles = document.createElement('style');
    modalStyles.textContent = `
        #ticketCardDetailsModal {
            display: block;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }

        #ticketCardDetailsModal .modal-content {
            background-color: white;
            margin: 10% auto;
            padding: 25px;
            border-radius: 8px;
            width: 90%;
            max-width: 500px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }

        #ticketCardDetailsModal .close {
            float: right;
            font-size: 24px;
            font-weight: bold;
            cursor: pointer;
            color: #666;
        }

        #ticketCardDetailsModal .close:hover {
            color: #000;
        }

        #ticketCardDetailsModal .form-group {
            margin-bottom: 20px;
        }

        #ticketCardDetailsModal label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #333;
        }

        #ticketCardDetailsModal input {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
        }

        #ticketCardDetailsModal input:focus {
            border-color: #007bff;
            outline: none;
            box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
        }

        #ticketCardDetailsModal .card-extra-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        #ticketCardDetailsModal .helper-text {
            display: block;
            margin-top: 5px;
            font-size: 12px;
            color: #666;
        }

        #ticketCardDetailsModal .pay-now-btn {
            background-color: #007bff;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            font-size: 16px;
            margin-top: 10px;
            transition: background-color 0.2s;
        }

        #ticketCardDetailsModal .pay-now-btn:hover {
            background-color: #0056b3;
        }

        #ticketCardDetailsModal .loader {
            text-align: center;
            margin-top: 15px;
            color: #666;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        #ticketCardDetailsModal .loader::after {
            content: '';
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(modalStyles);

    // Add input validation listeners
    setupCardValidation();
}

// Function to setup card validation
function setupCardValidation() {
    // Card number validation
    document.getElementById('cardNumber').addEventListener('input', function(e) {
        this.value = this.value.replace(/\D/g, '').slice(0, 16);
    });

    // Expiry date validation
    document.getElementById('cardExpiry').addEventListener('input', function(e) {
        let value = this.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2, 4);
        }
        this.value = value;
    });

    // CVV validation
    document.getElementById('cardCvv').addEventListener('input', function(e) {
        this.value = this.value.replace(/\D/g, '').slice(0, 3);
    });
}

// Function to close card modal
function closeCardModal() {
    const modal = document.getElementById('ticketCardDetailsModal');
    if (modal) {
        modal.remove();
    }
}

// Function to process card payment
async function processCardPayment() {
   try{// Get all card details
    const cardNumber = document.getElementById('cardNumber').value;
    const cardName = document.getElementById('cardName').value;
    const cardExpiry = document.getElementById('cardExpiry').value;
    const cardCvv = document.getElementById('cardCvv').value;
    
    // Validate all fields
    if (!/^\d{16}$/.test(cardNumber)) {
        alert('Please enter a valid 16-digit card number');
        return;
    }
    if (!cardName.trim()) {
        alert('Please enter the name on card');
        return;
    }
    if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
        alert('Please enter a valid expiry date (MM/YY)');
        return;
    }
    if (!/^\d{3}$/.test(cardCvv)) {
        alert('Please enter a valid 3-digit CVV');
        return;
    }

    // Show loader
    const loader = document.querySelector('#ticketCardDetailsModal .loader');
    const payButton = document.querySelector('#ticketCardDetailsModal .pay-now-btn');
    loader.style.display = 'block';
    loader.textContent = 'Processing payment...';
    payButton.disabled = true;

    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update loader text
    loader.textContent = 'Generating ticket...';

    // Process ticket generation
    await processTicketGeneration();

    // Close modal after successful ticket generation
    closeCardModal();

} catch (error) {
    console.error("Error processing payment:", error);
    alert('Error processing payment: ' + error.message);
    
    // Re-enable pay button and hide loader on error
    const loader = document.querySelector('#ticketCardDetailsModal .loader');
    const payButton = document.querySelector('#ticketCardDetailsModal .pay-now-btn');
    if (loader) loader.style.display = 'none';
    if (payButton) payButton.disabled = false;
}
}

// Function to process ticket generation
async function processTicketGeneration(isCardPayment = false) {
    try {
        const eventId = document.getElementById('ticketEventSelector').value;
        const ticketType = document.getElementById('ticketTypeSelector').value;
        const quantity = parseInt(document.getElementById('ticketQuantity').value);
        const userEmail = document.getElementById('ticketUserEmail').value.trim();
        const paymentMode = document.getElementById('paymentMode').value;

        // Check real-time availability again before proceeding
        const availability = await getRealTimeAvailability(eventId, ticketType);
        if (quantity > availability.available) {
            throw new Error(`Only ${availability.available} tickets available`);
        }

        // Get event details
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        if (!eventDoc.exists()) {
            throw new Error('Event not found');
        }

        const event = eventDoc.data();
        const isFreeEvent = event.pricingType === 'free' || event.price === 0;
        
        // Calculate price
        let ticketPrice = 0;
        if (!isFreeEvent) {
            if (event.eventType === 'hybrid') {
                ticketPrice = ticketType === 'venue' ? 
                    event.tickets.venue.price : 
                    event.tickets.online.price;
            } else {
                ticketPrice = event.price;
            }
        }

        const totalPrice = ticketPrice * quantity;

        // Create ticket document
        const ticketData = {
            eventId,
            ticketType,
            ticketCount: quantity,
            userEmail,
            ticketIdentifier: generateTicketId(),
            purchaseDate: new Date().toISOString(),
            paymentStatus: 'completed',
            paymentMethod: isFreeEvent ? 'free' : paymentMode,
            used: false,
            totalPrice: isFreeEvent ? 0 : totalPrice,
            pricePerTicket: isFreeEvent ? 0 : ticketPrice,
            adminGenerated: true,
            generatedBy: auth.currentUser.email
        };

        // Start batch write
        const batch = writeBatch(db);
        
        // Add ticket document
        const newTicketRef = doc(collection(db, 'tickets'));
        batch.set(newTicketRef, ticketData);

        // Update event available tickets
        const eventRef = doc(db, 'events', eventId);
        if (event.eventType === 'hybrid') {
            const updateField = ticketType === 'venue' ? 
                'tickets.venue.available' : 'tickets.online.available';
            batch.update(eventRef, {
                [updateField]: increment(-quantity),
                lastUpdated: serverTimestamp()
            });
        } else {
            batch.update(eventRef, {
                availableTickets: increment(-quantity),
                lastUpdated: serverTimestamp()
            });
        }

        await batch.commit();

        // Show success message
        alert(`Successfully generated ticket!\nTicket ID: ${ticketData.ticketIdentifier}`);
        
        // Clear form and update UI
        clearTicketForm();
        await updateTicketTypeOptions();
        
    } catch (error) {
        console.error("Error processing ticket:", error);
        throw error;
    }
}

// Initialize real-time listeners
function initializeTicketListeners() {
    const ticketsRef = collection(db, 'tickets');
    
    onSnapshot(ticketsRef, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added" || change.type === "modified") {
                const ticketData = change.doc.data();
                const currentEventId = document.getElementById('ticketEventSelector')?.value;
                if (currentEventId === ticketData.eventId) {
                    await updateTicketTypeOptions();
                }
            }
        });
    });

    // Also listen for event changes
    const eventsRef = collection(db, 'events');
    onSnapshot(eventsRef, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "modified") {
                const eventData = change.doc.data();
                const currentEventId = document.getElementById('ticketEventSelector')?.value;
                
                if (currentEventId === change.doc.id) {
                    console.log('Updating generate ticket section due to event change');
                    await updateTicketTypeOptions();
                    await updateTicketStats(currentEventId);
                }
            }
        });
    });
}

    // Make functions globally available
    window.getRealTimeAvailability = getRealTimeAvailability;
    window.updateTicketTypeOptions = updateTicketTypeOptions;
    window.processTicketGeneration = processTicketGeneration;

    // Initialize when document loads
    document.addEventListener('DOMContentLoaded', () => {
        initializeTicketListeners();
    });

    // Function to clear ticket form
    function clearTicketForm() {
        const elements = {
            ticketEventSelector: document.getElementById('ticketEventSelector'),
            ticketTypeSelector: document.getElementById('ticketTypeSelector'),
            ticketQuantity: document.getElementById('ticketQuantity'),
            ticketUserEmail: document.getElementById('ticketUserEmail'),
            paymentMode: document.getElementById('paymentMode'),
            pricePerTicket: document.getElementById('pricePerTicket'),
            totalTicketPrice: document.getElementById('totalTicketPrice')
        };

        // Clear form values
        if (elements.ticketEventSelector) elements.ticketEventSelector.value = '';
        if (elements.ticketTypeSelector) elements.ticketTypeSelector.value = '';
        if (elements.ticketQuantity) elements.ticketQuantity.value = '1';
        if (elements.ticketUserEmail) elements.ticketUserEmail.value = '';
        if (elements.paymentMode) elements.paymentMode.value = '';
        
        // Reset price displays
        if (elements.pricePerTicket) elements.pricePerTicket.textContent = '₹0';
        if (elements.totalTicketPrice) elements.totalTicketPrice.textContent = '₹0';
    }

    // Add these utility functions near the top of admin.js, after the imports
    function generateRandomFiveDigits() {
        return Math.floor(10000 + Math.random() * 90000).toString();
    }

    function getCurrentYear() {
        return new Date().getFullYear().toString();
    }

    function generateTicketId() {
        const randomNum = generateRandomFiveDigits();
        const year = getCurrentYear();
        return `TIX-${randomNum}-${year}`;
    }


    window.generateTicketId = generateTicketId;

    // Add this function to handle real-time updates for generate ticket section
    function initializeGenerateTicketListeners() {
        const ticketsRef = collection(db, 'tickets');
        
        // Listen for any ticket changes
        onSnapshot(ticketsRef, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === "added" || change.type === "modified") {
                    const ticketData = change.doc.data();
                    // Get current selected event in generate ticket section
                    const currentEventId = document.getElementById('ticketEventSelector')?.value;
                    
                    if (currentEventId === ticketData.eventId) {
                        console.log('Updating generate ticket section due to ticket change');
                        await updateTicketTypeOptions();
                        await updateTicketStats(currentEventId);
                    }
                }
            });
        });

        // Also listen for event changes
        const eventsRef = collection(db, 'events');
        onSnapshot(eventsRef, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === "modified") {
                    const eventData = change.doc.data();
                    const currentEventId = document.getElementById('ticketEventSelector')?.value;
                    
                    if (currentEventId === change.doc.id) {
                        console.log('Updating generate ticket section due to event change');
                        await updateTicketTypeOptions();
                        await updateTicketStats(currentEventId);
                    }
                }
            });
        });
    }

    // Update the DOMContentLoaded event listener
    document.addEventListener('DOMContentLoaded', () => {
        // ... existing initialization code ...

        // Initialize generate ticket listeners if we're on that section
        if (document.getElementById('generateTicket')?.style.display !== 'none') {
            initializeGenerateTicketListeners();
        }
    });

        // Add an event listener to sanitize pasted content
        document.getElementById('eventDescription').addEventListener('paste', function (event) {
            event.preventDefault(); // Prevent the default paste action
            
            // Get plain text from the clipboard
            const text = (event.clipboardData || window.clipboardData).getData('text');

            // Insert the plain text into the textarea
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.substring(0, start) + text + this.value.substring(end);
            
            // Place the cursor after the inserted text
            this.selectionStart = this.selectionEnd = start + text.length;
        });

function cancelEdit() {
    try {
        // Reset editing state
        isEditing = false;
        currentEditingEventId = null;
        document.getElementById('editingEventId').value = '';

        // Reset form fields
        document.getElementById('eventName').value = '';
        document.getElementById('eventCategory').value = '';
        document.getElementById('eventPricingType').value = '';
        document.getElementById('eventDescription').value = '';
        document.getElementById('eventDate').value = '';
        document.getElementById('bookingStartDate').value = '';
        document.getElementById('bookingDeadline').value = '';
        document.getElementById('eventPrice').value = '';
        document.getElementById('eventTickets').value = '';
        document.getElementById('eventType').value = '';
        document.getElementById('eventRules').innerHTML = '';

        // Reset custom category
        const otherCategoryGroup = document.getElementById('otherCategoryGroup');
        const otherCategoryInput = document.getElementById('otherCategoryName');
        if (otherCategoryGroup) otherCategoryGroup.style.display = 'none';
        if (otherCategoryInput) otherCategoryInput.value = '';

        // Reset scheduling
        const publishSchedule = document.getElementById('enablePublishSchedule');
        const hideSchedule = document.getElementById('enableHideSchedule');
        if (publishSchedule) publishSchedule.checked = false;
        if (hideSchedule) hideSchedule.checked = false;
        document.getElementById('publishScheduleSection').style.display = 'none';
        document.getElementById('hideScheduleSection').style.display = 'none';

        // Reset images
        const imageContainer = document.getElementById('imageUrlsContainer');
        if (imageContainer) {
            imageContainer.innerHTML = `
                <div class="form-group image-input">
                    <label>Image URL #1</label>
                    <input type="text" class="eventImage" placeholder="Enter image URL">
                    <button type="button" onclick="addImageField()" class="add-image-btn">+ Add Another Image</button>
                </div>
            `;
        }
        imageFieldCount = 1;

        // Reset buttons
        const cancelBtn = document.querySelector('.cancel-btn');
        const createBtn = document.querySelector('.create-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (createBtn) createBtn.textContent = 'Create Event';

        // Switch back to view mode
        toggleEventsView('view');

    } catch (error) {
        console.error("Error canceling edit:", error);
        alert("Error canceling edit. Please try again.");
    }
}

// Make function globally available
window.cancelEdit = cancelEdit;



