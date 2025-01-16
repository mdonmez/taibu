class TabooGame {
    constructor() {
        this.setupEventListeners();
        this.currentAttempt = 0;
        this.maxAttempts = 5;
        this.previousGuesses = [];
        this.initializeGuessesList();
    }

    setupEventListeners() {
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('guess-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.makeGuess(e.target.value);
        });
        document.getElementById('replay').addEventListener('click', () => this.resetGame());

        const difficultySelect = document.getElementById('difficulty');
        const startButton = document.getElementById('start-game');

        const updateButtonState = () => {
            const topicInput = document.getElementById('topic').value;
            if (difficultySelect.value === '' || !topicInput.trim()) {
                startButton.classList.add('unclickable');
            } else {
                startButton.classList.remove('unclickable');
            }
        };

        difficultySelect.addEventListener('change', updateButtonState);
        updateButtonState();
    }

    async startGame() {
        const difficulty = document.getElementById('difficulty').value;
        if (!difficulty) {
          return;
        }
        const topic = document.getElementById('topic').value;
        if (!topic || !topic.trim()) {
            return;
        }

        this.showLoader();
        document.getElementById('start-game').disabled = true;

        try {
            const response = await fetch('/game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    difficulty,
                    topic,
                    language: 'english'
                })
            });

            const data = await response.json();
            if (response.ok) {
                this.gameProps = data;
                this.switchScreen('game-screen');
                this.updateGameInfo(difficulty, topic);
                this.hideLoader();
                await this.getNewHint();
            } else {
                alert('Error starting game: ' + data.error);
            }
        } catch (error) {
            alert('Failed to start game: ' + error);
        } finally {
            document.getElementById('start-game').disabled = false;
        }
    }

    async getNewHint() {
        this.showHintLoader();
        document.getElementById('current-hint').textContent = '';

        try {
            const response = await fetch('/hints', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    props: this.gameProps,
                    previous_guesses: this.previousGuesses
                })
            });

            const data = await response.json();
            if (response.ok) {
                const hintElement = document.getElementById('current-hint');
                hintElement.textContent = data.hint;
                hintElement.classList.add('hint-fade');
                setTimeout(() => hintElement.classList.remove('hint-fade'), 300);

                const hintBox = document.getElementById('hint-box');
                hintBox.style.height = 'auto';
                const newHeight = hintBox.scrollHeight;
                hintBox.style.height = '0';
                setTimeout(() => hintBox.style.height = `${newHeight}px`, 0);
            }
        } catch (error) {
            alert('Failed to get hint: ' + error);
        } finally {
            this.hideHintLoader();
        }
    }

    async makeGuess(guess) {
        if (!guess.trim()) return;

        document.getElementById('guess-input').disabled = true;

        try {
            this.currentAttempt++;
            const similarity = this.checkSimilarity(guess, this.gameProps.word);
            if (similarity > 0.8) {
                this.showResult(true);
            } else {
                this.previousGuesses.push({
                    predict: guess,
                    sentence: document.getElementById('current-hint').textContent
                });

                if (this.currentAttempt === 1) {
                    this.removeGuessesListPlaceholder();
                }
                this.updateWrongGuessesList();

                if (this.currentAttempt >= this.maxAttempts) {
                    this.showResult(false);
                } else {
                    await this.getNewHint();
                }
            }
            document.getElementById('guess-input').value = '';
        } finally {
            document.getElementById('guess-input').disabled = false;
        }
    }

    checkSimilarity(str1, str2) {
        const str1Lower = str1.toLowerCase();
        const str2Lower = str2.toLowerCase();
        const edits = this.levenshteinDistance(str1Lower, str2Lower);
        const maxLength = Math.max(str1Lower.length, str2Lower.length);
        return 1 - (edits / maxLength);
    }

    levenshteinDistance(a, b) {
        const matrix = [];
        for (let i = 0; i <= a.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= b.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }
        return matrix[a.length][b.length];
    }

    updateGameInfo(difficulty, topic) {
        document.getElementById('difficulty-display').textContent = `difficulty: ${difficulty}`;
        document.getElementById('topic-display').textContent = `topic: ${topic}`;
    }

    updateWrongGuessesList() {
        const list = document.getElementById('guesses-list');
        list.innerHTML = this.previousGuesses
            .map((guess, index) => `<li>#${index + 1} -> ${guess.predict}</li>`)
            .join('');
    }

    showResult(won) {
        const resultMessage = document.getElementById('result-message');
        resultMessage.textContent = won ?
            `you won! you guessed the word '${this.gameProps.word}' in ${this.currentAttempt} attempts` :
            `you lose! you could not guess the correct word '${this.gameProps.word}'`;

        const bannedWordsElement = document.getElementById('banned-words');
        if (this.gameProps && this.gameProps.banned) {
            const bannedWordsList = this.gameProps.banned.join(', ');
            bannedWordsElement.textContent = `the banned words were:\n${bannedWordsList}`;
        } else {
            console.error('Banned words not found in game properties:', this.gameProps);
            bannedWordsElement.textContent = 'Error loading banned words';
        }

        this.switchScreen('result-screen');
    }

    switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach((screen) => {
            if (screen.id === screenId) {
                screen.classList.remove('hidden');
                screen.style.transform = 'translateY(0)';
                screen.style.opacity = '1';
            } else {
                screen.classList.add('hidden');
                screen.style.transform = 'translateY(10px)';
                screen.style.opacity = '0';
            }
        });
    }

    resetGame() {
        this.currentAttempt = 0;
        this.previousGuesses = [];
        this.switchScreen('setup-screen');
        this.initializeGuessesList();
    }

    initializeGuessesList() {
        const list = document.getElementById('guesses-list');
        list.innerHTML = '<li>no older guesses for now</li>';
    }

    removeGuessesListPlaceholder() {
        const list = document.getElementById('guesses-list');
        list.innerHTML = '';
    }

    showLoader() {
        const loader = document.getElementById('loader');
        loader.style.display = 'block';
    }

    hideLoader() {
        const loader = document.getElementById('loader');
        loader.style.display = 'none';
    }

    showHintLoader() {
        const loader = document.getElementById('hint-loader');
        loader.style.display = 'block';
    }

    hideHintLoader() {
        const loader = document.getElementById('hint-loader');
        loader.style.display = 'none';
    }
}


document.addEventListener('DOMContentLoaded', () => {
   const difficultySelect = document.getElementById('difficulty');
   const startButton = document.getElementById('start-game');

   const updateButtonState = () => {
    const topicInput = document.getElementById('topic').value;
     if (difficultySelect.value === '' || !topicInput.trim()) {
         startButton.classList.add('unclickable');
     } else {
         startButton.classList.remove('unclickable');
     }
   };
   updateButtonState();
   new TabooGame();
});