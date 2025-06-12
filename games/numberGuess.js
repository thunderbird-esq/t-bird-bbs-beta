/**
 * @file Number Guessing Game module for the BBS.
 * Provides functions to start, handle guesses for, and quit the Number Guess game.
 */

/**
 * Starts a new Number Guess game for the given session.
 * Initializes game state including a random target number and attempt count.
 *
 * @param {object} session - The user's session object.
 *                           `session.currentGame` will be populated with game state.
 * @returns {string} A welcome message with game instructions.
 */
function startGame(session) {
    // Generate a random number between 1 and 100 (inclusive).
    const targetNumber = Math.floor(Math.random() * 100) + 1;
    const maxAttempts = 7; // Set the maximum number of attempts allowed.

    // Store game state in the user's session.
    session.currentGame = {
        name: 'numberGuess',        // Identifier for the game.
        targetNumber: targetNumber, // The number the user needs to guess.
        attempts: 0,                // How many attempts the user has made.
        maxAttempts: maxAttempts    // Maximum allowed attempts.
    };
    // Log server-side for monitoring or debugging.
    console.log(`NumberGuess started for session ${session.username || 'guest'}: target ${targetNumber}`);
    return `Welcome to Number Guess! I'm thinking of a number between 1 and 100. You have ${maxAttempts} attempts. Type your guess (e.g., 42).\n`;
}

/**
 * Handles a user's guess in an active Number Guess game.
 * Compares the guess against the target number and provides feedback.
 * Ends the game on a correct guess or if max attempts are reached.
 *
 * @param {object} session - The user's session object, containing `session.currentGame`.
 * @param {string} guessString - The user's guess, as a string.
 * @returns {string} Feedback message (e.g., too high, too low, correct, game over).
 */
function handleGuess(session, guessString) {
    const guess = parseInt(guessString); // Convert the string guess to an integer.
    const game = session.currentGame;

    // Validate if the input was a number.
    if (isNaN(guess)) {
        return "That's not a valid number. Try again.\n";
    }

    // Safety check: ensure there's an active Number Guess game.
    // This should ideally not be hit if processInput routes correctly.
    if (!game || game.name !== 'numberGuess') {
        delete session.currentGame; // Clear potentially corrupted game state.
        return "Error: No active Number Guess game found. Starting over.\n";
    }

    game.attempts++; // Increment the attempts counter.

    // Check game conditions:
    if (guess === game.targetNumber) { // Correct guess
        const attemptsTaken = game.attempts;
        const revealedNumber = game.targetNumber;
        delete session.currentGame; // End the game by clearing its state from the session.
        console.log(`NumberGuess won: target ${revealedNumber}, attempts ${attemptsTaken}`);
        return `Correct! You guessed the number ${revealedNumber} in ${attemptsTaken} attempt(s).\n`;
    } else if (game.attempts >= game.maxAttempts) { // Out of attempts
        const revealedNumber = game.targetNumber;
        delete session.currentGame; // End the game.
        console.log(`NumberGuess lost: target ${revealedNumber}, attempts ${game.attempts}`);
        return `Sorry, you've run out of attempts! The number was ${revealedNumber}.\n`;
    } else if (guess < game.targetNumber) { // Guess too low
        return `Too low. Attempts left: ${game.maxAttempts - game.attempts}\n`;
    } else if (guess > game.targetNumber) { // Guess too high
        return `Too high. Attempts left: ${game.maxAttempts - game.attempts}\n`;
    }

    // Fallback error message, should not normally be reached.
    return "Error in guess logic. Please try again or type 'quit'.\n";
}

/**
 * Quits the current Number Guess game for the session.
 * Clears the game state from the session.
 *
 * @param {object} session - The user's session object.
 * @returns {string} A confirmation message that the game has been exited.
 */
function quitGame(session) {
    // Check if there's an active Number Guess game to quit.
    if (session.currentGame && session.currentGame.name === 'numberGuess') {
        console.log(`NumberGuess quit by user: target was ${session.currentGame.targetNumber}`);
        delete session.currentGame; // Remove game state from session.
        return "Exited Number Guess game.\n";
    }
    // If called when not in this specific game (e.g., via GAME QUIT command).
    return "You are not currently in the Number Guess game.\n";
}

module.exports = {
    startGame,
    handleGuess,
    quitGame
};
