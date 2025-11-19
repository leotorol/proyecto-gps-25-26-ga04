// model/dto/EventDTO.js
class EventDTO {
  constructor(event) {
    this.id = event._id;
    this.eventType = event.eventType;
    this.timestamp = event.timestamp.toISOString(); // Formato estándar
    this.userId = event.userId;
    this.entityId = event.entityId;
    this.entityType = event.entityType;
    this.metadata = event.metadata;
    this.receivedAt = event.receivedAt;
  }
}

module.exports = EventDTO;