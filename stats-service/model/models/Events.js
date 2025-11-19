// model/models/Event.js
const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: ['track.played', 'track.liked', 'artist.followed', 'order.paid', 'page.view']
  },
  timestamp: { type: Date, required: true, default: Date.now },
  userId: { type: String, index: true, sparse: true }, // index: true para búsquedas rápidas
  anonymous: { type: Boolean, default: false },
  entityType: {
    type: String,
    enum: ['track', 'album', 'artist', 'merch', 'page']
  },
  entityId: { type: String, index: true, sparse: true },
  metadata: { type: Object } // Para datos flexibles (duration, device, ip, price, genre)
}, {
  timestamps: { createdAt: 'receivedAt', updatedAt: false } // Solo nos importa cuándo se recibió
});

// Índices compuestos para consultas de agregación comunes
EventSchema.index({ eventType: 1, entityId: 1, timestamp: -1 });

module.exports = mongoose.model('Event', EventSchema);