// model/dto/TrendListDTO.js
const RankingItemDTO = require('./RankingItemDTO');

// Corresponde al schema 'TrendList' del YAML
class TrendListDTO {
  constructor(trendData) {
    // trendData es el documento del modelo 'Trend'
    this.period = trendData.period;
    
    // Mapeamos los sub-documentos
    this.trends = (trendData.trends || []).map(t => ({
      genre: t.genre,
      score: t.score,
      topItems: (t.topItems || []).map(item => new RankingItemDTO(item))
    }));
  }
}

module.projects = TrendListDTO;