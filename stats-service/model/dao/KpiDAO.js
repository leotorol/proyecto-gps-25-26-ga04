// model/dao/KpiDAO.js
const ArtistKPI = require('../models/ArtistKPI');

class KpiDAO {

  /**
   * Obtiene los KPIs para un artista en un rango de fechas.
   * El controlador llamaría a esto.
   */
  async getKpisForArtist(artistId, startDate, endDate) {
    try {
      // Lógica para buscar los KPIs diarios y sumarlos,
      // o buscar un período 'all_time' si no hay fechas.
      
      const query = {
        artistId: artistId,
      };

      if (startDate && endDate) {
        query.period = 'day'; // Asumimos que sumamos KPIs diarios
        query.dateMarker = { $gte: new Date(startDate), $lte: new Date(endDate) };
        
        // Esta consulta debería ser una agregación (pipeline) para sumar los días
        // pero por simplicidad, aquí buscamos un solo registro (ej. 'all_time')
      } else {
        query.period = 'all_time'; // Pedir el total histórico
      }

      // Ejemplo simple: buscar el 'all_time'
      return await ArtistKPI.findOne({ artistId: artistId, period: 'all_time' });

    } catch (error) {
      throw new Error(`Error al obtener KPIs: ${error.message}`);
    }
  }

  // El job en segundo plano usaría un método como este:
  // async upsertKPI(artistId, period, dateMarker, kpiData) { ... }
}

module.exports = new KpiDAO();