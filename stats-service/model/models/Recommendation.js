// model/models/Recommendation.js
const mongoose = require('mongoose');

// Almacena las recomendaciones pre-calculadas para un usuario
const RecommendationSchema = new mongoose.Schema({
  // Para quién es esta recomendación
  userId: { type: String, required: true }, 
  
  // La lista de items recomendados
  recommendations: [{
    _id: false,
    id: { type: String }, // ID del track/album/artist
    type: { type: String, enum: ['track', 'album', 'artist'] },
    reason: { type: String }, // ej. "same_genre", "top_artist"
    score: { type: Number }
  }]
}, {
  timestamps: { createdAt: false, updatedAt: 'lastCalculated' }
});

RecommendationSchema.index({ userId: 1 });

module.exports = mongoose.model('Recommendation', RecommendationSchema);