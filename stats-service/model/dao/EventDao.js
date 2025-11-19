// model/dao/EventDAO.js
const Event = require('../models/Event');

class EventDAO {
  
  /**
   * Guarda un único evento. Usado por el 'consumer' de la cola.
   */
  async createEvent(data) {
    try {
      const event = new Event(data);
      return await event.save();
    } catch (error) {
      throw new Error(`Error al crear el evento: ${error.message}`);
    }
  }

  /**
   * Guarda múltiples eventos en batch.
   * (Esta es una implementación más realista para alta ingesta)
   */
  async createEventsBatch(eventsData) {
    try {
      return await Event.insertMany(eventsData, { ordered: false });
    } catch (error) {
      // Ignorar errores de duplicados, pero registrar otros
      if (error.code !== 11000) {
        console.error(`Error en la inserción de eventos en batch: ${error.message}`);
      }
      return error.result;
    }
  }

  // Aquí irían métodos para leer eventos si se necesitaran
  // async getEventsByUserId(userId, limit = 50) { ... }
}

module.exports = new EventDAO();