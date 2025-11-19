// model/models/ArtistKPI.js
const mongoose = require('mongoose');

const ArtistKPISchema = new mongoose.Schema({
  artistId: { type: String, required: true, index: true },
  period: { type: String, required: true, enum: ['day', 'week', 'month', 'year', 'all_time'] },
  // Fecha que representa el inicio del período (ej. '2023-10-27' para el día)
  dateMarker: { type: Date, required: true }, 

  plays: { type: Number, default: 0 },
  uniqueListeners: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  follows: { type: Number, default: 0 },
  purchases: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
}, {
  timestamps: { createdAt: false, updatedAt: 'lastCalculated' } // Cuándo se actualizó
});

// Índice principal para consultas rápidas del dashboard
ArtistKPISchema.index({ artistId: 1, period: 1, dateMarker: -1 });

module.exports = mongoose.model('ArtistKPI', ArtistKPISchema);