// model/dto/RecommendationDTO.js
// Corresponde al schema 'SimpleRecommendation' del YAML
class RecommendationDTO {
  constructor(recData) {
    // recData es un item del array 'recommendations' del modelo
    this.id = recData.id;
    this.type = recData.type;
    this.reason = recData.reason;
    this.score = recData.score;
  }
}

module.exports = RecommendationDTO;