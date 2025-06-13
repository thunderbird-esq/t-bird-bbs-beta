// Dragging functionality
document.querySelectorAll('.title-bar').forEach(titleBar => {
    let offsetX, offsetY;
    const windowEl = titleBar.parentElement;

    titleBar.onmousedown = function(e) {
        offsetX = windowEl.offsetLeft - e.clientX;
        offsetY = windowEl.offsetTop - e.clientY;

        document.onmousemove = function(e) {
            windowEl.style.left = e.clientX + offsetX + 'px';
            windowEl.style.top = e.clientY + offsetY + 'px';
        };

        document.onmouseup = function() {
            document.onmousemove = null;
        };
    };
});

// Banner Generator (no changes) …
function createBanner() { /* … */ }

// Modem Connection Sequence (no changes) …
function startModemSequence() { /* … */ }

// Command handler
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('bbs-command').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const command = this.value.trim().toUpperCase();
            const terminal = document.getElementById('message-display');

            if (command === 'HELP') {
                terminal.innerHTML += '\n\nCOMMANDS: HELP, LOGIN, LIST, QUIT';
            } else if (command === 'LOGIN') {
                terminal.innerHTML += '\n\nLOGIN FEATURE COMING SOON';
            } else if (command === 'LIST') {
                terminal.innerHTML += '\n\nMESSAGES: NONE';
            } else if (command === 'QUIT') {
                terminal.innerHTML += '\n\nDISCONNECTING...';
            } else {
                terminal.innerHTML += '\n\nUNKNOWN COMMAND';
            }

            this.value = '';
            terminal.scrollTop = terminal.scrollHeight;
        }
    });

    // now that CLEAR has class="clear", this will work:
    document.querySelector('.btn.clear').addEventListener('click', function() {
        document.getElementById('message-display').innerHTML = createBanner();
    });

    window.onload = function() {
        setTimeout(startModemSequence, 500);
    };
});

