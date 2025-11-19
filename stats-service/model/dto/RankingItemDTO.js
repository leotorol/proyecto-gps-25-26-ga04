// model/dto/RankingItemDTO.js
// Este DTO corresponde al schema 'RankingItem' en el YAML
class RankingItemDTO {
  constructor(itemData) {
    // itemData es un objeto del array 'items' del modelo Ranking
    this.id = itemData.id;
    this.type = itemData.type; // El DAO debe añadir esto
    this.title = itemData.title;
    this.artistName = itemData.artistName;
    this.metricValue = itemData.metricValue;
  }
}

module.exports = RankingItemDTO;