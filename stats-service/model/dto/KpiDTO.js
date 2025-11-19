// model/dto/KpiDTO.js
class KpiDTO {
  constructor(kpiData) {
    // kpiData es el documento de la BDD (ArtistKPI)
    this.artistId = kpiData.artistId;
    this.period = kpiData.period; // O el rango de fechas solicitado
    this.plays = kpiData.plays;
    this.uniqueListeners = kpiData.uniqueListeners;
    this.likes = kpiData.likes;
    this.follows = kpiData.follows;
    this.purchases = kpiData.purchases;
    this.revenue = kpiData.revenue;
  }
}

module.exports = KpiDTO;