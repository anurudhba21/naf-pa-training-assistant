document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const pdfFilenameEl = document.getElementById('pdf-filename');
    const pdfPagesEl = document.getElementById('pdf-pages');
    const pdfCharsEl = document.getElementById('pdf-chars');
    const pdfStatusTextEl = document.getElementById('pdf-status-text');
    const pdfStatusDotEl = document.getElementById('pdf-status-dot');
    const welcomePdfNameEl = document.getElementById('welcome-pdf-name');

    const keyStatusEl = document.getElementById('key-status');
    const apiConfigureTip = document.getElementById('api-configure-tip');
    const welcomeNoticeEl = document.getElementById('welcome-notice');

    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');

    // App State
    let conversationHistory = [];
    let isServerKeyAvailable = false;

    // Configure Marked.js options
    marked.setOptions({
        breaks: true,
        gfm: true
    });

    // 1. Fetch PDF & Server Info
    fetchInfo();

    // 2. Autogrow User Input Textarea
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = (userInput.scrollHeight) + 'px';
    });

    // 3. Handle Suggested Questions
    document.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            userInput.value = btn.textContent;
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';
            userInput.focus();
            
            // Auto scroll to input bar
            userInput.scrollIntoView({ behavior: 'smooth' });
        });
    });

    // 4. Clear Chat
    clearChatBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the chat history?')) {
            // Keep the first welcome message
            const welcomeMsg = chatMessages.firstElementChild;
            chatMessages.innerHTML = '';
            if (welcomeMsg) {
                chatMessages.appendChild(welcomeMsg);
            }
            conversationHistory = [];
        }
    });

    // 5. Submit Chat Form
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendMessage();
    });

    // Prevent enter key from creating newline, instead submit form (Shift+Enter for newline)
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled && userInput.value.trim()) {
                sendMessage();
            }
        }
    });

    // Helper functions
    function updateKeyStatus(configured, message) {
        if (configured) {
            keyStatusEl.className = 'key-status-msg configured';
            keyStatusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${message}`;
        } else {
            keyStatusEl.className = 'key-status-msg not-configured';
            keyStatusEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${message}`;
        }
    }

    function checkReadyState() {
        userInput.disabled = !isServerKeyAvailable;
        sendBtn.disabled = !isServerKeyAvailable;
        
        if (isServerKeyAvailable) {
            userInput.placeholder = "Ask a question about the NAF training notes...";
            apiConfigureTip.style.display = 'none';
            if (welcomeNoticeEl) {
                welcomeNoticeEl.className = 'notice-text';
                welcomeNoticeEl.style.color = 'var(--success)';
                welcomeNoticeEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Connected to Gemini API. Ready to chat!`;
            }
        } else {
            userInput.placeholder = "Configure GEMINI_API_KEY in the backend's .env file to chat...";
            apiConfigureTip.style.display = 'block';
            if (welcomeNoticeEl) {
                welcomeNoticeEl.className = 'notice-text';
                welcomeNoticeEl.style.color = 'var(--warning)';
                welcomeNoticeEl.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Please configure the Gemini API Key in the <code>.env</code> file in your workspace to begin.`;
            }
        }
    }

    async function fetchInfo() {
        try {
            const res = await fetch('/api/info');
            if (!res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();
            
            pdfFilenameEl.textContent = data.filename;
            welcomePdfNameEl.textContent = data.filename;
            pdfPagesEl.textContent = data.pages;
            
            // Format character counts nicely
            if (data.characters > 1000) {
                pdfCharsEl.textContent = (data.characters / 1000).toFixed(1) + 'k chars';
            } else {
                pdfCharsEl.textContent = data.characters + ' chars';
            }
            
            // Update connection status
            pdfStatusTextEl.textContent = data.status;
            pdfStatusDotEl.className = 'status-dot';
            
            if (data.status.toLowerCase().includes('success') || data.status.toLowerCase().includes('loaded')) {
                pdfStatusDotEl.classList.add('active');
            } else if (data.status.toLowerCase().includes('error')) {
                pdfStatusDotEl.classList.add('error');
            } else {
                pdfStatusDotEl.classList.add('pulsing');
            }

            // Check if server environment already has API key
            if (data.has_env_key) {
                isServerKeyAvailable = true;
                updateKeyStatus(true, 'Active (Server Key)');
            } else {
                isServerKeyAvailable = false;
                updateKeyStatus(false, 'No key found in .env');
            }
            
            checkReadyState();
        } catch (err) {
            console.error('Error fetching backend info:', err);
            pdfStatusTextEl.textContent = 'Server Disconnected';
            pdfStatusDotEl.className = 'status-dot error';
            updateKeyStatus(false, 'Server unavailable');
            checkReadyState();
        }
    }

    function formatCitations(html) {
        // Regex to match (Page X) or [Page X] or Page X with pages in document
        // Captures references like: (Page 12), [Page 5], Page 22, (Pages 3-4)
        return html.replace(/(?:\(|\[)?Pages?\s+(\d+(?:-\d+)?)(?:\)|\])?/gi, (match, pageNum) => {
            return `<span class="citation">Page ${pageNum}</span>`;
        });
    }

    function appendMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.innerHTML = role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';

        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = 'message-content-wrapper';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'sender-name';
        nameDiv.textContent = role === 'user' ? 'You' : 'NAF Training AI';

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        
        if (role === 'user') {
            textDiv.textContent = content;
        } else {
            // Parse Markdown for assistant responses
            const rawHtml = marked.parse(content);
            textDiv.innerHTML = formatCitations(rawHtml);
        }

        wrapperDiv.appendChild(nameDiv);
        wrapperDiv.appendChild(textDiv);
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(wrapperDiv);

        chatMessages.appendChild(messageDiv);
        
        // Auto scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showTypingIndicator() {
        const indicatorDiv = document.createElement('div');
        indicatorDiv.className = 'message assistant-message typing-indicator-msg';
        indicatorDiv.id = 'typing-indicator';

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        avatarDiv.innerHTML = '<i class="fa-solid fa-robot"></i>';

        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = 'message-content-wrapper';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'sender-name';
        nameDiv.textContent = 'NAF Training AI';

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.innerHTML = `
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;

        wrapperDiv.appendChild(nameDiv);
        wrapperDiv.appendChild(textDiv);
        indicatorDiv.appendChild(avatarDiv);
        indicatorDiv.appendChild(wrapperDiv);

        chatMessages.appendChild(indicatorDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    async function sendMessage() {
        const messageText = userInput.value.trim();
        if (!messageText) return;

        // Clear input and reset height
        userInput.value = '';
        userInput.style.height = 'auto';

        // Add to UI
        appendMessage('user', messageText);

        // Add typing indicator
        showTypingIndicator();

        // Lock UI during query
        userInput.disabled = true;
        sendBtn.disabled = true;

        try {
            const requestPayload = {
                message: messageText,
                history: conversationHistory,
                api_key: null // Stored purely in backend now
            };

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestPayload)
            });

            removeTypingIndicator();

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Failed to generate response');
            }

            const data = await response.json();
            
            // Add assistant response to UI
            appendMessage('assistant', data.response);

            // Save to local conversation history
            conversationHistory.push({ role: 'user', content: messageText });
            conversationHistory.push({ role: 'assistant', content: data.response });

            // Keep history trimmed to save token limit if needed (e.g. last 12 messages)
            if (conversationHistory.length > 20) {
                conversationHistory = conversationHistory.slice(conversationHistory.length - 20);
            }

        } catch (err) {
            removeTypingIndicator();
            appendMessage('assistant', `⚠️ **Error:** ${err.message}\n\n*Please verify your backend connection or check if the API key in your .env file is correct and active.*`);
            console.error('Chat error:', err);
        } finally {
            // Unlock UI
            userInput.disabled = false;
            sendBtn.disabled = false;
            checkReadyState();
            userInput.focus();
        }
    }
});
