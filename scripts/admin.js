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

// Initialize TinyMCE
tinymce.init({
    selector: '.tinymce-editor',
    height: 300,
    plugins: [
        'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
        'anchor', 'searchreplace', 'visualblocks', 
        'code', 'fullscreen',
        'insertdatetime', 'media', 'table', 'wordcount'
    ],
    toolbar: 'undo redo | formatselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | help',
    apiKey: 'your-api-key-here',
    readonly: false
});

// Navigation function
async function showSection(sectionId) {
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
    try {
        switch (sectionId) {
            case 'passes':
                console.log('Initializing passes section...');
                await initializePassesSection();
                break;
            case 'generateTicket':
                console.log('Initializing ticket generation...');
                await populateEventSelector('ticketEventSelector');
                break;
            // ... other cases ...
        }
    } catch (error) {
        console.error(`Error initializing section ${sectionId}:`, error);
    }
}

// Update populateEventSelector function to properly handle passes
async function populateEventSelector(selectorId) {
    try {
        console.log(`Populating event selector: ${selectorId}`);
        const selector = document.getElementById(selectorId);
        if (!selector) {
            console.error(`Selector not found: ${selectorId}`);
            return;
        }

        // Clear existing options
        selector.innerHTML = '<option value="">Select an Event</option>';

        // Get events from Firestore
        const eventsRef = collection(db, 'events');
        const eventsSnapshot = await getDocs(eventsRef);
        
        // Sort events by date (newest first)
        const events = [];
        eventsSnapshot.forEach(doc => {
            const eventData = doc.data();
            events.push({
                id: doc.id,
                name: eventData.name,
                date: new Date(eventData.date)
            });
        });

        events.sort((a, b) => b.date - a.date);

        // Add events to selector
        events.forEach(event => {
            const option = document.createElement('option');
            option.value = event.id;
            option.textContent = `${event.name} (${event.date.toLocaleDateString()})`;
            selector.appendChild(option);
        });

        console.log(`Populated ${events.length} events`);

    } catch (error) {
        console.error("Error populating event selector:", error);
        alert("Error loading events. Please try again.");
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

        const eventsSnapshot = await getDocs(eventsRef);
        const totalEvents = eventsSnapshot.size;

        let totalRevenue = 0;
        let ticketsSold = 0;
        let totalTickets = 0;
        let upcomingEvents = 0;
        let completedEvents = 0;
        let totalScannedTickets = 0;

        const currentDate = new Date();

        // Calculate event-related stats
        eventsSnapshot.forEach(doc => {
            const event = doc.data();
            const eventDate = new Date(event.date);
            
            // Calculate total tickets based on event type
            if (event.eventType === 'hybrid') {
                totalTickets += (Number(event.tickets?.venue?.total) || 0) + 
                              (Number(event.tickets?.online?.total) || 0);
            } else {
                totalTickets += Number(event.totalTickets) || 0;
            }
            
            if (eventDate > currentDate) {
                upcomingEvents++;
            } else {
                completedEvents++;
            }
        });

        // Calculate ticket sales, scanned tickets, and revenue only from active events
        const ticketsSnapshot = await getDocs(ticketsRef);
        const activeEventIds = new Set(eventsSnapshot.docs.map(doc => doc.id));

        ticketsSnapshot.forEach(doc => {
            const ticket = doc.data();
            
            // Only count tickets from active (non-deleted) events
            if (activeEventIds.has(ticket.eventId) && ticket.paymentStatus === 'completed') {
                ticketsSold += Number(ticket.ticketCount) || 0;
                totalRevenue += Number(ticket.totalPrice) || 0;

                // Count scanned tickets
                if (ticket.used === true) {
                    totalScannedTickets += Number(ticket.ticketCount) || 0;
                }
            }
        });

        // Ensure available tickets is never negative
        const availableTickets = Math.max(0, totalTickets - ticketsSold);

        // Update dashboard stats
        document.getElementById('totalEvents').textContent = totalEvents;
        document.getElementById('upcomingEvents').textContent = upcomingEvents;
        document.getElementById('completedEvents').textContent = completedEvents;
        document.getElementById('totalTickets').textContent = totalTickets;
        document.getElementById('ticketsSold').textContent = ticketsSold;
        document.getElementById('ticketsScanned').textContent = totalScannedTickets;
        document.getElementById('availableTickets').textContent = availableTickets;
        document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);

        await loadRecentEvents();
        await loadRecentTickets();

    } catch (error) {
        console.error("Error loading dashboard:", error);
        alert("Error loading dashboard data: " + error.message);
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
            const passData = {
                eventId,
                role: finalRole,
                passIdentifier: generatePassIdentifier(),
                createdAt: serverTimestamp(),
                used: false
            };

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
    return 'PASS-' + Math.random().toString(36).substr(2, 9).toUpperCase();
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

// Function to update ticket type options based on selected event
async function updateTicketTypeOptions() {
    const eventId = document.getElementById('ticketEventSelector').value;
    const typeSelector = document.getElementById('ticketTypeSelector');
    typeSelector.innerHTML = '<option value="">Select Ticket Type</option>';
    
    if (!eventId) return;
    
    try {
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        const event = eventDoc.data();
        
        if (event.eventType === 'hybrid') {
            typeSelector.innerHTML += `
                <option value="venue">Venue Ticket (₹${event.tickets.venue.price})</option>
                <option value="online">Online Ticket (₹${event.tickets.online.price})</option>
            `;
        } else {
            typeSelector.innerHTML += `
                <option value="standard">Standard Ticket (₹${event.price})</option>
            `;
        }
        
        updateTicketPrice();
    } catch (error) {
        console.error("Error loading ticket types:", error);
    }
}

// Function to update ticket price display
function updateTicketPrice() {
    const quantity = parseInt(document.getElementById('ticketQuantity').value) || 0;
    const typeSelector = document.getElementById('ticketTypeSelector');
    const selectedOption = typeSelector.options[typeSelector.selectedIndex];
    
    let pricePerTicket = 0;
    if (selectedOption && selectedOption.text) {
        pricePerTicket = parseInt(selectedOption.text.match(/₹(\d+)/)[1]) || 0;
    }
    
    const totalPrice = pricePerTicket * quantity;
    
    document.getElementById('pricePerTicket').textContent = `₹${pricePerTicket}`;
    document.getElementById('totalTicketPrice').textContent = `₹${totalPrice}`;
}

// Function to generate ticket for user
async function generateTicketForUser() {
    try {
        console.log('Starting ticket generation...');
        
        // Get form elements
        const eventSelector = document.getElementById('ticketEventSelector');
        const typeSelector = document.getElementById('ticketTypeSelector');
        const quantityInput = document.getElementById('ticketQuantity');
        const emailInput = document.getElementById('ticketUserEmail');
        const paymentModeSelect = document.getElementById('paymentMode');
        
        // Validate form elements
        if (!eventSelector || !typeSelector || !quantityInput || !emailInput || !paymentModeSelect) {
            throw new Error('Form elements not found');
        }

        // Get values
        const eventId = eventSelector.value;
        const ticketType = typeSelector.value;
        const quantity = parseInt(quantityInput.value);
        const userEmail = emailInput.value.trim();
        const paymentMode = paymentModeSelect.value;
        
        // Validate values
        if (!eventId || !ticketType || !quantity || !userEmail) {
            const missingFields = [];
            if (!eventId) missingFields.push('Event');
            if (!ticketType) missingFields.push('Ticket Type');
            if (!quantity) missingFields.push('Quantity');
            if (!userEmail) missingFields.push('Email');
            if (!paymentMode) missingFields.push('Payment Mode');
            
            alert(`Please fill in the following fields: ${missingFields.join(', ')}`);
            return;
        }
         // If card payment, show card details modal
         if (paymentMode === 'card') {
            showCardDetailsModal();
            return;
        }

        // For cash payment, proceed directly
        await processTicketGeneration(false);
        

        // Get event details
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        if (!eventDoc.exists()) {
            throw new Error('Event not found');
        }

        const event = eventDoc.data();
        
        // Check current ticket count
        const ticketsRef = collection(db, 'tickets');
        const ticketQuery = query(ticketsRef, 
            where('eventId', '==', eventId), 
            where('ticketType', '==', ticketType),
            where('paymentStatus', '==', 'completed')
        );
        const ticketSnapshot = await getDocs(ticketQuery);
        const soldTickets = ticketSnapshot.docs.reduce((total, doc) => 
            total + (doc.data().ticketCount || 1), 0);

        // Calculate availability and price
        let availableTickets = 0;
        let ticketPrice = 0;

        if (event.eventType === 'hybrid') {
            if (ticketType === 'venue') {
                availableTickets = event.tickets.venue.total - soldTickets;
                ticketPrice = event.tickets.venue.price;
            } else {
                availableTickets = event.tickets.online.total - soldTickets;
                ticketPrice = event.tickets.online.price;
            }
        } else {
            availableTickets = event.totalTickets - soldTickets;
            ticketPrice = event.price;
        }

        if (availableTickets < quantity) {
            throw new Error(`Only ${availableTickets} tickets available`);
        }

        const totalPrice = ticketPrice * quantity;
        
        // Start batch write
        const batch = writeBatch(db);

        // Create ticket document
        const ticketData = {
            eventId,
            ticketType,
            ticketCount: quantity,
            userEmail,
            ticketIdentifier: 'TKT-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            purchaseDate: new Date().toISOString(),
            paymentStatus: 'completed', // Set as completed for admin-generated tickets
            used: false,
            totalPrice,
            pricePerTicket: ticketPrice,
            adminGenerated: true,
            generatedBy: auth.currentUser.email
        };

        const newTicketRef = doc(ticketsRef);
        batch.set(newTicketRef, ticketData);

        // Update event document with new stats
        const eventRef = doc(db, 'events', eventId);
        batch.update(eventRef, {
            soldTickets: increment(quantity),
            totalRevenue: increment(totalPrice),
            lastUpdated: serverTimestamp()
        });

        // Commit all changes
        await batch.commit();
        
        // Clear form
        eventSelector.value = '';
        typeSelector.value = '';
        quantityInput.value = '1';
        emailInput.value = '';
        
        // Reset price displays
        document.getElementById('pricePerTicket').textContent = '₹0';
        document.getElementById('totalTicketPrice').textContent = '₹0';
        
        // Update all stats displays
        await Promise.all([
            loadDashboard(),
            updateTicketStats(),
            loadEvents()
        ]);
        
  
    } catch (error) {
        console.error("Error generating ticket:", error);
        alert('Error generating ticket: ' + error.message);
    }
}

// Add function to update ticket stats
// Update ticket stats function
async function updateTicketStats() {
    try {
        console.log('Updating ticket stats...');
        
        // Get references
        const ticketsRef = collection(db, 'tickets');
        const eventsRef = collection(db, 'events');
        
        // Get all active events
        const eventsSnapshot = await getDocs(eventsRef);
        const activeEventIds = new Set(eventsSnapshot.docs.map(doc => doc.id));
        
        let totalTickets = 0;
        let soldTickets = 0;
        let scannedTickets = 0;
        let totalRevenue = 0;

        // Calculate total tickets from events
        eventsSnapshot.forEach(eventDoc => {
            const event = eventDoc.data();
            if (event.eventType === 'hybrid') {
                totalTickets += (Number(event.tickets?.venue?.total) || 0) + 
                              (Number(event.tickets?.online?.total) || 0);
            } else {
                totalTickets += Number(event.totalTickets) || 0;
            }
        });

        // Get all tickets with completed payments
        const ticketsQuery = query(ticketsRef, where('paymentStatus', '==', 'completed'));
        const ticketsSnapshot = await getDocs(ticketsQuery);
        
        // Calculate sold, scanned tickets and revenue
        ticketsSnapshot.forEach(doc => {
            const ticket = doc.data();
            // Only count tickets from active events
            if (activeEventIds.has(ticket.eventId)) {
                const ticketCount = Number(ticket.ticketCount) || 1;
                soldTickets += ticketCount;
                totalRevenue += Number(ticket.totalPrice) || 0;
                
                if (ticket.used) {
                    scannedTickets += ticketCount;
                }
            }
        });

        // Calculate available tickets
        const availableTickets = Math.max(0, totalTickets - soldTickets);

        console.log('Ticket stats calculated:', {
            total: totalTickets,
            sold: soldTickets,
            available: availableTickets,
            scanned: scannedTickets,
            revenue: totalRevenue
        });

        // Update stats display
        const elements = {
            adminTotalTickets: document.getElementById('adminTotalTickets'),
            adminSoldTickets: document.getElementById('adminSoldTickets'),
            adminAvailableTickets: document.getElementById('adminAvailableTickets'),
            adminUsedTickets: document.getElementById('adminUsedTickets'),
            adminTotalRevenue: document.getElementById('adminTotalRevenue')
        };

        // Check if elements exist before updating
        if (elements.adminTotalTickets) elements.adminTotalTickets.textContent = totalTickets;
        if (elements.adminSoldTickets) elements.adminSoldTickets.textContent = soldTickets;
        if (elements.adminAvailableTickets) elements.adminAvailableTickets.textContent = availableTickets;
        if (elements.adminUsedTickets) elements.adminUsedTickets.textContent = scannedTickets;
        if (elements.adminTotalRevenue) elements.adminTotalRevenue.textContent = formatCurrency(totalRevenue);

    } catch (error) {
        console.error("Error updating ticket stats:", error);
        console.error("Error stack:", error.stack);
    }
}

// Helper function for currency formatting
function formatCurrency(amount) {
    return '₹' + amount.toLocaleString('en-IN');
}

// Make functions globally available
window.closeCardModal = closeCardModal;
window.processCardPayment = processCardPayment;
window.generateTicketForUser = generateTicketForUser;
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

// Add function to download single pass
async function downloadPass(passId) {
    try {
        const passDoc = await getDoc(doc(db, 'passes', passId));
        if (!passDoc.exists()) {
            throw new Error('Pass not found');
        }

        const passData = passDoc.data();
        if (!passData.eventId) {
            throw new Error('Pass has no associated event');
        }

        const eventDoc = await getDoc(doc(db, 'events', passData.eventId));
        if (!eventDoc.exists()) {
            throw new Error('Associated event not found');
        }

        const eventData = eventDoc.data();

        // Create a temporary container for the pass
        const container = document.createElement('div');
        container.className = 'pass-download-template';
        container.innerHTML = `
            <div class="pass-header">
                <h2>Event Pass</h2>
                <p class="pass-id">${passData.passIdentifier}</p>
            </div>
            <div class="pass-content">
                <p><strong>Event:</strong> ${eventData.name}</p>
                <p><strong>Date:</strong> ${new Date(eventData.date).toLocaleDateString()}</p>
                <p><strong>Role:</strong> ${passData.role}</p>
                <p><strong>Status:</strong> ${passData.used ? 'Used' : 'Valid'}</p>
                <div id="pass-qr-${passId}"></div>
            </div>
        `;

        document.body.appendChild(container);

        // Generate QR code
        new QRCode(document.getElementById(`pass-qr-${passId}`), {
            text: passData.passIdentifier,
            width: 128,
            height: 128
        });

        // Use html2canvas to create image
        const canvas = await html2canvas(container);
        const link = document.createElement('a');
        link.download = `pass-${passData.passIdentifier}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        // Clean up
        document.body.removeChild(container);

    } catch (error) {
        console.error("Error downloading pass:", error);
        alert('Error downloading pass: ' + error.message);
    }
}


// Add function to download selected passes
async function downloadSelectedPasses() {
    const selectedPasses = document.querySelectorAll('.pass-select:checked');
    if (selectedPasses.length === 0) {
        alert('Please select at least one pass to download');
        return;
    }

    try {
        for (const checkbox of selectedPasses) {
            const passId = checkbox.dataset.passId;
            await downloadPass(passId);
            // Add small delay between downloads to prevent browser issues
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    } catch (error) {
        console.error("Error downloading passes:", error);
        alert('Error downloading passes: ' + error.message);
    }
}
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
window.downloadPass = downloadPass;
window.downloadSelectedPasses = downloadSelectedPasses;
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
window.generateTicketForUser = generateTicketForUser;
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
        console.log('processTicketGeneration called from:', isCardPayment ? 'card payment' : 'cash payment');
        // Get form values
        const eventId = document.getElementById('ticketEventSelector').value;
        const ticketType = document.getElementById('ticketTypeSelector').value;
        const quantity = parseInt(document.getElementById('ticketQuantity').value);
        const userEmail = document.getElementById('ticketUserEmail').value.trim();
        const paymentMode = document.getElementById('paymentMode').value;

        // Get event details
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        if (!eventDoc.exists()) {
            throw new Error('Event not found');
        }

        const event = eventDoc.data();
        
        // Check current ticket count
        const ticketsRef = collection(db, 'tickets');
        const ticketQuery = query(ticketsRef, 
            where('eventId', '==', eventId), 
            where('ticketType', '==', ticketType),
            where('paymentStatus', '==', 'completed')
        );
        const ticketSnapshot = await getDocs(ticketQuery);
        const soldTickets = ticketSnapshot.docs.reduce((total, doc) => 
            total + (doc.data().ticketCount || 1), 0);

        // Calculate availability and price
        let availableTickets = 0;
        let ticketPrice = 0;

        if (event.eventType === 'hybrid') {
            if (ticketType === 'venue') {
                availableTickets = event.tickets.venue.total - soldTickets;
                ticketPrice = event.tickets.venue.price;
            } else {
                availableTickets = event.tickets.online.total - soldTickets;
                ticketPrice = event.tickets.online.price;
            }
        } else {
            availableTickets = event.totalTickets - soldTickets;
            ticketPrice = event.price;
        }

        if (availableTickets < quantity) {
            throw new Error(`Only ${availableTickets} tickets available`);
        }

        const totalPrice = ticketPrice * quantity;
        
        // Create ticket document
        const ticketData = {
            eventId,
            ticketType,
            ticketCount: quantity,
            userEmail,
            ticketIdentifier: 'TKT-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            purchaseDate: new Date().toISOString(),
            paymentStatus: 'completed',
            paymentMethod: paymentMode,
            used: false,
            totalPrice,
            pricePerTicket: ticketPrice,
            adminGenerated: true,
            generatedBy: auth.currentUser.email
        };

        // Start batch write
        const batch = writeBatch(db);

        // Add ticket document
        const newTicketRef = doc(ticketsRef);
        batch.set(newTicketRef, ticketData);

        // Update event document with new stats
        const eventRef = doc(db, 'events', eventId);
        batch.update(eventRef, {
            soldTickets: increment(quantity),
            totalRevenue: increment(totalPrice),
            lastUpdated: serverTimestamp()
        });

        // Commit the batch
        await batch.commit();
        // Show success message only if not called from card payment
        if (!isCardPayment) {
            alert(`Successfully generated ticket!\nTicket ID: ${ticketData.ticketIdentifier}`);
        }

        // Clear form
        clearTicketForm();
        
        // Update stats displays
        Promise.all([
            loadDashboard(),
            updateTicketStats(),
            loadEvents()
        ]).catch(error => {
            console.error("Error updating stats:", error);
        });
        
        // Return the ticket identifier for card payment flow
        return ticketData.ticketIdentifier;
        
    } catch (error) {
        console.error("Error processing ticket:", error);
        throw error; // Re-throw to be handled by the calling function
    }
}

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




