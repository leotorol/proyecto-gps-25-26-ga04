// model/models/RankingItem.js
const mongoose = require('mongoose');

// Este modelo guarda el "Top 10" de la semana, etc.
const RankingSchema = new mongoose.Schema({
  type: { type: String, enum: ['track', 'album', 'artist'], required: true },
  period: { type: String, enum: ['day', 'week', 'month', 'year'], required: true },
  dateMarker: { type: Date, required: true },
  
  // Guardamos el ranking como un array de items
  items: [{
    _id: false,
    id: { type: String }, // ID de la entidad (track, album, artist)
    title: { type: String },
    artistName: { type: String },
    metricValue: { type: Number } // (plays, ventas, etc.)
  }]
}, {
  timestamps: { createdAt: false, updatedAt: 'lastCalculated' }
});

RankingSchema.index({ type: 1, period: 1, dateMarker: -1 });

module.exports = mongoose.model('Ranking', RankingSchema);