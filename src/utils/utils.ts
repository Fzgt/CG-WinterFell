export const randomInRange = (from: number, to: number) => {
    return Math.floor(Math.random() * (to - from + 1)) - to;
}

export const updateHighScores = (newScore: number) => {
    const highScoresStr = localStorage.getItem('winterfell-high-scores');
    const highScores = highScoresStr ? JSON.parse(highScoresStr) : [];

    highScores.push(newScore);
    highScores.sort((a: number, b: number) => b - a);

    const topScores = highScores.slice(0, 3);

    localStorage.setItem('winterfell-high-scores', JSON.stringify(topScores));

    return topScores;
};