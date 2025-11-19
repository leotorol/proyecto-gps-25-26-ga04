// model/factory/EventFactory.js
class EventFactory {
  createEvent(data) {
    
    // Validación básica requerida por el YAML
    if (!data.eventType || !data.timestamp) {
      throw new Error('eventType y timestamp son requeridos');
    }

    return {
      eventType: data.eventType,
      timestamp: new Date(data.timestamp), // Asegurar que sea un objeto Date
      userId: data.userId || null,
      anonymous: data.anonymous || !data.userId,
      entityType: data.entityType || null,
      entityId: data.entityId || null,
      metadata: data.metadata || {}
    };
  }
}

module.exports = new EventFactory();