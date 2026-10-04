const path = require('path');

const DEFAULT_BACKGROUND_ID = 'synthwave';

const CARD_BACKGROUNDS = Object.freeze([
    {
        id: 'sakura',
        label: 'Sakura Sunset',
        path: path.resolve(__dirname, '../UI/welcomeimages/1.png')
    },
    {
        id: 'ember',
        label: 'Ember Forest',
        path: path.resolve(__dirname, '../UI/welcomeimages/2.jpg')
    },
    {
        id: 'city',
        label: 'City Night',
        path: path.resolve(__dirname, '../UI/welcomeimages/3.jpg')
    }
]);

function getCardBackground(backgroundId) {
    return CARD_BACKGROUNDS.find((background) => background.id === backgroundId) || null;
}

module.exports = { DEFAULT_BACKGROUND_ID, CARD_BACKGROUNDS, getCardBackground };