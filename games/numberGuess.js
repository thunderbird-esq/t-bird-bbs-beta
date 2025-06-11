function startGame(session) {
    const targetNumber = Math.floor(Math.random() * 100) + 1;
    const maxAttempts = 7;
    session.currentGame = {
        name: 'numberGuess',
        targetNumber: targetNumber,
        attempts: 0,
        maxAttempts: maxAttempts
    };
    console.log(`NumberGuess started for session ${session.username || 'guest'}: target ${targetNumber}`);
    return `Welcome to Number Guess! I'm thinking of a number between 1 and 100. You have ${maxAttempts} attempts. Type your guess (e.g., 42).\n`;
}

function handleGuess(session, guessString) {
    const guess = parseInt(guessString);
    const game = session.currentGame;

    if (isNaN(guess)) {
        return "That's not a valid number. Try again.\n";
    }

    if (!game || game.name !== 'numberGuess') {
        // Should not happen if called correctly
        delete session.currentGame;
        return "Error: No active Number Guess game found. Starting over.\n";
    }

    game.attempts++;

    if (guess === game.targetNumber) {
        const attemptsTaken = game.attempts;
        const revealedNumber = game.targetNumber; // Capture before deleting game state
        delete session.currentGame; // Game over
        console.log(`NumberGuess won: target ${revealedNumber}, attempts ${attemptsTaken}`);
        return `Correct! You guessed the number ${revealedNumber} in ${attemptsTaken} attempt(s).\n`;
    } else if (game.attempts >= game.maxAttempts) {
        const revealedNumber = game.targetNumber; // Capture before deleting game state
        delete session.currentGame; // Game over
        console.log(`NumberGuess lost: target ${revealedNumber}, attempts ${game.attempts}`);
        return `Sorry, you've run out of attempts! The number was ${revealedNumber}.\n`;
    } else if (guess < game.targetNumber) {
        return `Too low. Attempts left: ${game.maxAttempts - game.attempts}\n`;
    } else if (guess > game.targetNumber) {
        return `Too high. Attempts left: ${game.maxAttempts - game.attempts}\n`;
    }
    // This line should ideally not be reached if logic is correct
    return "Error in guess logic. Please try again or type 'quit'.\n";
}

function quitGame(session) {
    if (session.currentGame && session.currentGame.name === 'numberGuess') {
        console.log(`NumberGuess quit by user: target was ${session.currentGame.targetNumber}`);
        delete session.currentGame;
        return "Exited Number Guess game.\n";
    }
    // It's possible to call GAME QUIT when not in this specific game, or any game.
    // So, a more generic message might be better if called via GAME QUIT when not in numberGuess
    // but for direct "quit" input, this is fine.
    return "You are not currently in the Number Guess game.\n";
}

module.exports = {
    startGame,
    handleGuess,
    quitGame
};
