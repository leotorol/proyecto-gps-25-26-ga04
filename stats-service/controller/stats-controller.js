// --- Importaciones de Servicios y DAOs ---
// (Asumiendo que existen servicios para manejar la lógica de negocio)
const StatsService = require('../services/StatsService');
const RecommendationService = require('../services/RecommendationService');
const EventService = require('../services/EventService'); // Para la ingesta de eventos

// --- Importaciones de DTOs ---
// (Basado en los esquemas del YAML y tu uso de DTOs)
const EventDTO = require('../model/dto/EventDTO');
const KpiDTO = require('../model/dto/KpiDTO');
const RankingItemDTO = require('../model/dto/RankingItemDTO');
const TrendListDTO = require('../model/dto/TrendListDTO');
const RecommendationDTO = require('../model/dto/RecommendationDTO');

// --- Importaciones de 'utils' (como en tu AlbumController) ---
const fs = require('fs');
const path = require('path');
const os = require('os');

class StatsController {

    /**
     * @route POST /stats/events
     * @description Acepta un evento para ingesta asíncrona.
     */
    async submitEvent(req, res) {
        try {
            const eventData = req.body;

            // 1. Validar el evento (usando una factory, como en tu createAlbum)
            // const eventEntity = EventFactory.createEvent(eventData);

            // 2. Enviar el evento al servicio de ingesta (cola o persistencia)
            // No esperamos a que se procese, solo a que se acepte.
            const result = await EventService.enqueueEvent(eventData);

            // 3. Responder 202 Accepted (como define el YAML)
            res.status(202).json({
                accepted: true,
                jobId: result.jobId || null
            });

        } catch (error) {
            console.error("Error en submitEvent:", error);
            // 400 para data inválida
            if (error.name === 'ValidationError') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * @route GET /stats/artist/{artistId}/kpis
     * @description Obtiene KPIs resumidos para un artista.
     */
    async getArtistKpis(req, res) {
        try {
            const { artistId } = req.params;
            const { startDate, endDate } = req.query;

            const kpis = await StatsService.getKpisForArtist(artistId, { startDate, endDate });

            if (!kpis) {
                return res.status(404).json({ error: 'Estadísticas de artista no encontradas' });
            }

            // Formatear la salida usando un DTO
            res.json(new KpiDTO(kpis));

        } catch (error) {
            console.error("Error en getArtistKpis:", error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * @route GET /stats/top
     * @description Obtiene rankings (top) por tipo y período.
     */
    async getTopRankings(req, res) {
        try {
            // Extraer y validar query params
            const { type, period = 'week', limit = 10 } = req.query;

            if (!type) {
                return res.status(400).json({ error: 'El parámetro "type" (track, album, artist) es requerido' });
            }

            const rankings = await StatsService.getTopRankings({
                type,
                period,
                limit: parseInt(limit)
            });

            // Convertir a DTOs (como haces en getAlbums)
            const rankingDTOs = rankings.map(item => new RankingItemDTO(item));
            res.json(rankingDTOs);

        } catch (error) {
            console.error("Error en getTopRankings:", error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * @route GET /stats/trending
     * @description Obtiene tendencias por género o global.
     */
    async getTrending(req, res) {
        try {
            const { genre, period = 'week', limit = 10 } = req.query;

            const trends = await StatsService.getTrending({
                genre: genre || 'global', // Asumir 'global' si no se provee
                period,
                limit: parseInt(limit)
            });

            // El schema 'TrendList' es un objeto, no un array
            res.json(new TrendListDTO(trends));

        } catch (error) {
            console.error("Error en getTrending:", error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * @route GET /stats/export
     * @description Exporta métricas en CSV o JSON.
     */
    async exportMetrics(req, res) {
        try {
            const { type = 'plays', startDate, endDate, format = 'csv' } = req.query;

            const data = await StatsService.getExportData({ type, startDate, endDate });

            if (format === 'json') {
                // Respuesta JSON simple
                return res.json(data);
            }

            if (format === 'csv') {
                // Generar CSV (siguiendo tu lógica de 'downloadTrack')
                const tempDir = os.tmpdir();
                const filename = `export-${type}-${Date.now()}.csv`;
                const outputPath = path.join(tempDir, filename);

                // El StatsService debería tener un método para generar el archivo
                await StatsService.generateCsvFile(data, outputPath);

                // Enviar el archivo para descarga (como en downloadTrack)
                return res.download(outputPath, `${type}_export.csv`, (err) => {
                    // Limpiar el archivo temporal
                    fs.unlink(outputPath, () => {});
                    if (err) {
                        console.error(`Error al enviar el archivo de exportación: ${err.message}`);
                    }
                });
            }

            return res.status(400).json({ error: 'Formato de exportación no válido. Use "csv" o "json".' });

        } catch (error) {
            console.error("Error en exportMetrics:", error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * @route GET /recommendations/user/{userId}
     * @description Obtiene recomendaciones "Para ti" (heurísticas).
     */
    async getUserRecommendations(req, res) {
        try {
            const { userId } = req.params;
            const { limit = 20 } = req.query;

            const recommendations = await RecommendationService.getForUser(userId, {
                limit: parseInt(limit)
            });

            if (!recommendations) {
                return res.status(404).json({ error: 'Usuario no encontrado o sin recomendaciones' });
            }

            const recDTOs = recommendations.map(item => new RecommendationDTO(item));
            res.json(recDTOs);

        } catch (error) {
            console.error("Error en getUserRecommendations:", error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * @route GET /recommendations/similar
     * @description Obtiene recomendaciones similares a una entidad.
     */
    async getSimilarRecommendations(req, res) {
        try {
            const { type, id, limit = 10 } = req.query;

            if (!type || !id) {
                return res.status(400).json({ error: 'Los parámetros "type" e "id" son requeridos' });
            }

            const recommendations = await RecommendationService.getSimilar({
                type,
                id,
                limit: parseInt(limit)
            });

            const recDTOs = recommendations.map(item => new RecommendationDTO(item));
            res.json(recDTOs);

        } catch (error) {
            console.error("Error en getSimilarRecommendations:", error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * @route POST /recommendations/refresh
     * @description Dispara un recálculo de recomendaciones (admin).
     */
    async triggerRecalculation(req, res) {
        try {
            const { userId, mode = 'global' } = req.body;

            // Iniciar el job en segundo plano
            const jobInfo = await RecommendationService.startRecalculationJob({ userId, mode });

            // Responder 202 Accepted (el trabajo se está procesando)
            res.status(202).json({
                accepted: true,
                jobId: jobInfo.jobId
            });

        } catch (error) {
            console.error("Error en triggerRecalculation:", error);
            res.status(500).json({ error: error.message });
        }
    }
}

// Exportar una instancia, igual que en tu AlbumController
module.exports = new StatsController();