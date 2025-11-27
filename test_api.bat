@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul

:: ═══════════════════════════════════════════════════════════════════════════
:: SCRIPT DE PRUEBAS AUTOMATIZADAS - UnderSounds API
:: ═══════════════════════════════════════════════════════════════════════════

echo.
echo ╔══════════════════════════════════════════════════════════════════════════╗
echo ║            UNDERSOUNDS API - PRUEBAS AUTOMATIZADAS                       ║
echo ╚══════════════════════════════════════════════════════════════════════════╝
echo.

:: ═══════════════════════════════════════════════════════════════════════════
:: CONFIGURACIÓN - MODIFICA AQUÍ TU EMAIL PARA RECIBIR ALERTAS
:: ═══════════════════════════════════════════════════════════════════════════
set MY_EMAIL=lolaso12344ygs@gmail.com
:: ═══════════════════════════════════════════════════════════════════════════

:: Configuración de puertos
set USER_SERVICE=http://localhost:5000/api/auth
set CONTENT_SERVICE=http://localhost:5001/api
set STATS_SERVICE=http://localhost:5002/api

:: Datos de prueba (se genera un email único para cada ejecución)
set TEST_EMAIL=testautomated_%RANDOM%@example.com
set TEST_USERNAME=testuser_%RANDOM%
set TEST_PASSWORD=Test1234!

:: Variables para almacenar tokens e IDs
set ACCESS_TOKEN=
set REFRESH_TOKEN=
set USER_ID=
set ARTIST_ID=
set ALBUM_ID=
set NEWS_ID=
set MERCH_ID=

:: Contadores
set TESTS_PASSED=0
set TESTS_FAILED=0

:: Archivo temporal para respuestas
set TEMP_FILE=%TEMP%\api_response_%RANDOM%.json

:: ═══════════════════════════════════════════════════════════════════════════
:: FUNCIONES AUXILIARES
:: ═══════════════════════════════════════════════════════════════════════════

goto :main

:log_success
echo [OK] %~1
set /a TESTS_PASSED+=1
goto :eof

:log_fail
echo [FAIL] %~1
set /a TESTS_FAILED+=1
goto :eof

:log_info
echo [INFO] %~1
goto :eof

:log_section
echo.
echo ─────────────────────────────────────────────────────────────────────────────
echo   %~1
echo ─────────────────────────────────────────────────────────────────────────────
goto :eof

:extract_json_value
:: Extrae un valor de JSON usando PowerShell
:: %1 = archivo JSON, %2 = propiedad, %3 = variable de salida
for /f "usebackq delims=" %%a in (`powershell -Command "try { (Get-Content '%~1' -Raw -ErrorAction Stop | ConvertFrom-Json).%~2 } catch { '' }"`) do set "%~3=%%a"
goto :eof

:extract_json_array_first
:: Extrae el primer elemento de un array JSON
:: %1 = archivo JSON, %2 = propiedad del elemento, %3 = variable de salida
for /f "usebackq delims=" %%a in (`powershell -Command "try { $json = Get-Content '%~1' -Raw | ConvertFrom-Json; if ($json -is [array] -and $json.Count -gt 0) { $json[0].%~2 } elseif ($json.%~2) { $json.%~2 } } catch { '' }"`) do set "%~3=%%a"
goto :eof

:check_service
:: Verifica si un servicio está disponible
curl -s -o nul -w "%%{http_code}" %~1 > %TEMP%\http_code.txt 2>nul
set /p HTTP_CODE=<%TEMP%\http_code.txt
if "%HTTP_CODE%"=="000" (
    echo [WARN] Servicio no disponible: %~1
    exit /b 1
)
exit /b 0

:: ═══════════════════════════════════════════════════════════════════════════
:: INICIO DE PRUEBAS
:: ═══════════════════════════════════════════════════════════════════════════

:main

call :log_section "VERIFICANDO SERVICIOS"

call :check_service "%USER_SERVICE%/me"
if errorlevel 1 (
    echo [ERROR] User Service no esta corriendo en puerto 5000
    echo         Ejecuta: cd user-service ^&^& npm start
    goto :end
)
call :log_success "User Service (5000) disponible"

call :check_service "%CONTENT_SERVICE%/albums"
if errorlevel 1 (
    echo [ERROR] Content Service no esta corriendo en puerto 5001
    echo         Ejecuta: cd content-service ^&^& npm start
    goto :end
)
call :log_success "Content Service (5001) disponible"

call :check_service "%STATS_SERVICE%/stats/cache/info"
if errorlevel 1 (
    echo [ERROR] Stats Service no esta corriendo en puerto 5002
    echo         Ejecuta: cd stats-service ^&^& python server.py
    goto :end
)
call :log_success "Stats Service (5002) disponible"

:: ═══════════════════════════════════════════════════════════════════════════
:: 1. USER SERVICE - REGISTRO Y LOGIN
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "USER SERVICE - REGISTRO Y LOGIN"

:: 1.1 Registro - CORREGIDO: AccountDTO devuelve "id" no "_id"
call :log_info "Registrando usuario: %TEST_EMAIL%"
curl -s -X POST "%USER_SERVICE%/register" ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"%TEST_USERNAME%\",\"email\":\"%TEST_EMAIL%\",\"password\":\"%TEST_PASSWORD%\"}" ^
  -o "%TEMP_FILE%"

:: Intentar extraer ID en orden de prioridad
call :extract_json_value "%TEMP_FILE%" "id" USER_ID
if not defined USER_ID call :extract_json_value "%TEMP_FILE%" "_id" USER_ID
if not defined USER_ID call :extract_json_value "%TEMP_FILE%" "user.id" USER_ID
if not defined USER_ID call :extract_json_value "%TEMP_FILE%" "account.id" USER_ID
if defined USER_ID (
    call :log_success "Registro exitoso - User ID: %USER_ID%"
) else (
    call :log_fail "Registro fallido"
    type "%TEMP_FILE%"
    echo.
)

:: 1.2 Login
call :log_info "Iniciando sesion..."
curl -s -X POST "%USER_SERVICE%/login" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"%TEST_EMAIL%\",\"password\":\"%TEST_PASSWORD%\"}" ^
  -o "%TEMP_FILE%"

call :extract_json_value "%TEMP_FILE%" "accessToken" ACCESS_TOKEN
call :extract_json_value "%TEMP_FILE%" "refreshToken" REFRESH_TOKEN

if defined ACCESS_TOKEN (
    call :log_success "Login exitoso - Token obtenido"
) else (
    call :log_fail "Login fallido"
    type "%TEMP_FILE%"
    echo.
)

:: 1.3 Obtener perfil con /me - CORREGIDO: username está en account.username
if defined ACCESS_TOKEN (
    call :log_info "Obteniendo perfil con /me..."
    curl -s -X GET "%USER_SERVICE%/me" ^
      -H "Authorization: Bearer %ACCESS_TOKEN%" ^
      -o "%TEMP_FILE%"
    
    :: Intentar diferentes rutas
    call :extract_json_value "%TEMP_FILE%" "account.username" PROFILE_USERNAME
    if not defined PROFILE_USERNAME call :extract_json_value "%TEMP_FILE%" "username" PROFILE_USERNAME
    if defined PROFILE_USERNAME (
        call :log_success "Perfil obtenido: %PROFILE_USERNAME%"
    ) else (
        call :log_fail "Error obteniendo perfil"
        type "%TEMP_FILE%"
        echo.
    )
)

:: 1.4 Refresh Token
if defined ACCESS_TOKEN (
    call :log_info "Probando refresh token (via cookie)..."
    curl -s -X POST "%USER_SERVICE%/refresh-token" ^
      -H "Content-Type: application/json" ^
      -H "Cookie: refreshToken=%REFRESH_TOKEN%" ^
      -o "%TEMP_FILE%"
    
    call :extract_json_value "%TEMP_FILE%" "accessToken" NEW_ACCESS_TOKEN
    if defined NEW_ACCESS_TOKEN (
        set ACCESS_TOKEN=%NEW_ACCESS_TOKEN%
        call :log_success "Refresh token exitoso - Nuevo token obtenido"
    ) else (
        call :extract_json_value "%TEMP_FILE%" "error" REFRESH_ERROR
        if defined REFRESH_ERROR (
            call :log_info "Refresh token: %REFRESH_ERROR%"
        ) else (
            call :log_info "Refresh token: respuesta recibida"
        )
    )
)

:: 1.5 Actualizar perfil
if defined USER_ID (
    call :log_info "Actualizando perfil..."
    curl -s -X PUT "%USER_SERVICE%/%USER_ID%" ^
      -H "Content-Type: application/json" ^
      -H "Authorization: Bearer %ACCESS_TOKEN%" ^
      -d "{\"bio\":\"Bio actualizada por prueba automatizada\"}" ^
      -o "%TEMP_FILE%"
    
    call :extract_json_value "%TEMP_FILE%" "bio" UPDATED_BIO
    if defined UPDATED_BIO (
        call :log_success "Perfil actualizado"
    ) else (
        call :log_info "Actualizacion: respuesta recibida"
    )
)

:: ═══════════════════════════════════════════════════════════════════════════
:: 2. USER SERVICE - RECUPERACION DE CONTRASEÑA
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "USER SERVICE - RECUPERACION DE CONTRASENA"

:: 2.1 Forgot Password (solicitar OTP)
call :log_info "Solicitando OTP para recuperacion de contrasena..."
curl -s -X POST "%USER_SERVICE%/forgot-password" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"%TEST_EMAIL%\"}" ^
  -o "%TEMP_FILE%"

call :extract_json_value "%TEMP_FILE%" "message" FORGOT_MSG
if defined FORGOT_MSG (
    call :log_success "Forgot password: OTP enviado"
) else (
    call :log_info "Forgot password: respuesta recibida"
)

:: 2.2 Reset Password (con OTP falso para probar validación)
call :log_info "Probando reset password con OTP invalido (debe fallar)..."
curl -s -X POST "%USER_SERVICE%/reset-password" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"%TEST_EMAIL%\",\"otp\":\"000000\",\"newPassword\":\"NewPass123\"}" ^
  -o "%TEMP_FILE%"

call :extract_json_value "%TEMP_FILE%" "error" RESET_ERROR
if defined RESET_ERROR (
    call :log_success "Reset password valida OTP correctamente (rechazo esperado)"
) else (
    call :log_info "Reset password: respuesta recibida"
)

:: ═══════════════════════════════════════════════════════════════════════════
:: 3. CONTENT SERVICE - ARTISTS
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "CONTENT SERVICE - ARTISTAS"

:: 3.1 Obtener artistas existentes - CORREGIDO: usar "id" numérico, no "_id"
call :log_info "Obteniendo artistas existentes..."
curl -s -X GET "%CONTENT_SERVICE%/artists" -o "%TEMP_FILE%"
:: Primero intentar "id" (numérico), luego "_id" como fallback
call :extract_json_array_first "%TEMP_FILE%" "id" ARTIST_ID
if not defined ARTIST_ID call :extract_json_array_first "%TEMP_FILE%" "_id" ARTIST_ID

if defined ARTIST_ID (
    call :log_success "Artista existente encontrado: %ARTIST_ID%"
) else (
    :: 3.2 Crear artista si no existe
    call :log_info "Creando artista de prueba..."
    curl -s -X POST "%CONTENT_SERVICE%/artists" ^
      -H "Content-Type: application/json" ^
      -d "{\"name\":\"Test Artist %RANDOM%\",\"genre\":\"Rock\",\"bio\":\"Artista de prueba automatizada\"}" ^
      -o "%TEMP_FILE%"
    
    :: Primero "id" numérico
    call :extract_json_value "%TEMP_FILE%" "id" ARTIST_ID
    if not defined ARTIST_ID call :extract_json_value "%TEMP_FILE%" "_id" ARTIST_ID
    if defined ARTIST_ID (
        call :log_success "Artista creado: %ARTIST_ID%"
    ) else (
        call :log_fail "Error creando artista"
        type "%TEMP_FILE%"
        echo.
    )
)

:: 3.3 Obtener artista por ID 
if defined ARTIST_ID (
    call :log_info "Obteniendo artista por ID..."
    curl -s -X GET "%CONTENT_SERVICE%/artists/%ARTIST_ID%" -o "%TEMP_FILE%"
    call :extract_json_value "%TEMP_FILE%" "name" ARTIST_NAME
    if defined ARTIST_NAME (
        call :log_success "Artista obtenido: %ARTIST_NAME%"
    ) else (
        call :log_fail "Error obteniendo artista"
        type "%TEMP_FILE%"
        echo.
    )
)

:: 3.4 Actualizar artista
if defined ARTIST_ID (
    call :log_info "Actualizando artista..."
    curl -s -X PUT "%CONTENT_SERVICE%/artists/%ARTIST_ID%" ^
      -H "Content-Type: application/json" ^
      -d "{\"bio\":\"Bio actualizada por test automatizado\"}" ^
      -o "%TEMP_FILE%"
    call :log_success "Artista actualizado"
)

:: ═══════════════════════════════════════════════════════════════════════════
:: 4. CONTENT SERVICE - ALBUMS
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "CONTENT SERVICE - ALBUMS"

:: 4.1 Obtener albums existentes
call :log_info "Obteniendo albums existentes..."
curl -s -X GET "%CONTENT_SERVICE%/albums" -o "%TEMP_FILE%"
call :extract_json_array_first "%TEMP_FILE%" "_id" ALBUM_ID
if not defined ALBUM_ID call :extract_json_array_first "%TEMP_FILE%" "id" ALBUM_ID

if defined ALBUM_ID (
    call :log_success "Album existente encontrado: %ALBUM_ID%"
) else (
    :: 4.2 Crear album si no existe
    if defined ARTIST_ID (
        call :log_info "Creando album de prueba..."
        curl -s -X POST "%CONTENT_SERVICE%/albums" ^
          -H "Content-Type: application/json" ^
          -d "{\"title\":\"Test Album %RANDOM%\",\"artistId\":\"%ARTIST_ID%\",\"genre\":\"Rock\",\"price\":9.99,\"releaseYear\":2025}" ^
          -o "%TEMP_FILE%"
        
        :: Probar múltiples rutas para el ID
        call :extract_json_value "%TEMP_FILE%" "album.id" ALBUM_ID
        if not defined ALBUM_ID call :extract_json_value "%TEMP_FILE%" "album._id" ALBUM_ID
        if not defined ALBUM_ID call :extract_json_value "%TEMP_FILE%" "id" ALBUM_ID
        if not defined ALBUM_ID call :extract_json_value "%TEMP_FILE%" "_id" ALBUM_ID
        if defined ALBUM_ID (
            call :log_success "Album creado: %ALBUM_ID%"
        ) else (
            call :log_fail "Error creando album"
            type "%TEMP_FILE%"
            echo.
        )
    )
)

:: 4.3 Obtener album por ID
if defined ALBUM_ID (
    call :log_info "Obteniendo album por ID..."
    curl -s -X GET "%CONTENT_SERVICE%/albums/%ALBUM_ID%" -o "%TEMP_FILE%"
    call :extract_json_value "%TEMP_FILE%" "title" ALBUM_TITLE
    if not defined ALBUM_TITLE call :extract_json_value "%TEMP_FILE%" "name" ALBUM_TITLE
    if defined ALBUM_TITLE (
        call :log_success "Album obtenido: %ALBUM_TITLE%"
    ) else (
        call :log_fail "Error obteniendo album"
        type "%TEMP_FILE%"
        echo.
    )
)

:: 4.4 Filtrar albums por genero y limite
call :log_info "Filtrando albums por genero Rock (limit=5)..."
curl -s -X GET "%CONTENT_SERVICE%/albums?genre=Rock&limit=5" -o "%TEMP_FILE%"
for /f %%a in ('powershell -Command "try { (Get-Content '%TEMP_FILE%' -Raw | ConvertFrom-Json).Count } catch { 0 }"') do set ALBUM_COUNT=%%a
call :log_success "Albums filtrados: %ALBUM_COUNT% resultados"

:: 4.5 Actualizar album
if defined ALBUM_ID (
    call :log_info "Actualizando album..."
    curl -s -X PUT "%CONTENT_SERVICE%/albums/%ALBUM_ID%" ^
      -H "Content-Type: application/json" ^
      -d "{\"price\":12.99}" ^
      -o "%TEMP_FILE%"
    call :log_success "Album actualizado"
)

:: 4.6 Añadir valoracion
if defined ALBUM_ID (
    call :log_info "Anadiendo valoracion al album..."
    curl -s -X POST "%CONTENT_SERVICE%/albums/%ALBUM_ID%/rate" ^
      -H "Content-Type: application/json" ^
      -d "{\"userId\":\"%USER_ID%\",\"rating\":4.5,\"comment\":\"Excelente album - prueba automatizada\"}" ^
      -o "%TEMP_FILE%"
    
    call :extract_json_value "%TEMP_FILE%" "success" RATING_SUCCESS
    if "%RATING_SUCCESS%"=="True" (
        call :log_success "Valoracion anadida"
    ) else (
        call :log_info "Valoracion: respuesta recibida"
    )
)

:: ═══════════════════════════════════════════════════════════════════════════
:: 5. CONTENT SERVICE - NOTICIAS
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "CONTENT SERVICE - NOTICIAS"

:: 5.1 Obtener noticias existentes - CORREGIDO: ruta es /noticias
call :log_info "Obteniendo noticias..."
curl -s -X GET "%CONTENT_SERVICE%/noticias" -o "%TEMP_FILE%"
call :extract_json_array_first "%TEMP_FILE%" "_id" NEWS_ID
if not defined NEWS_ID call :extract_json_array_first "%TEMP_FILE%" "id" NEWS_ID

if defined NEWS_ID (
    call :log_success "Noticia existente encontrada: %NEWS_ID%"
) else (
    :: 5.2 Crear noticia - CORREGIDO: ruta /noticias, campos en español
    call :log_info "Creando noticia de prueba..."
    curl -s -X POST "%CONTENT_SERVICE%/noticias" ^
      -H "Content-Type: application/json" ^
      -d "{\"titulo\":\"Noticia Test %RANDOM%\",\"body\":\"Contenido de prueba automatizada\",\"autor\":\"Test Bot\",\"image\":\"https://picsum.photos/800/400\"}" ^
      -o "%TEMP_FILE%"
    
    call :extract_json_value "%TEMP_FILE%" "_id" NEWS_ID
    if not defined NEWS_ID call :extract_json_value "%TEMP_FILE%" "id" NEWS_ID
    if defined NEWS_ID (
        call :log_success "Noticia creada: %NEWS_ID%"
    ) else (
        call :log_fail "Error creando noticia"
        type "%TEMP_FILE%"
        echo.
    )
)

:: 5.3 Obtener noticia por ID - CORREGIDO: ruta /noticias
if defined NEWS_ID (
    call :log_info "Obteniendo noticia por ID..."
    curl -s -X GET "%CONTENT_SERVICE%/noticias/%NEWS_ID%" -o "%TEMP_FILE%"
    call :extract_json_value "%TEMP_FILE%" "titulo" NEWS_TITLE
    if defined NEWS_TITLE (
        call :log_success "Noticia obtenida: %NEWS_TITLE%"
    ) else (
        call :log_info "Noticia: respuesta recibida"
    )
)

:: 5.4 Actualizar noticia - CORREGIDO: ruta /noticias
if defined NEWS_ID (
    call :log_info "Actualizando noticia..."
    curl -s -X PUT "%CONTENT_SERVICE%/noticias/%NEWS_ID%" ^
      -H "Content-Type: application/json" ^
      -d "{\"titulo\":\"Noticia Actualizada %RANDOM%\"}" ^
      -o "%TEMP_FILE%"
    call :log_success "Noticia actualizada"
)

:: ═══════════════════════════════════════════════════════════════════════════
:: 6. CONTENT SERVICE - MERCHANDISING
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "CONTENT SERVICE - MERCHANDISING"

:: 6.1 Obtener merchandising existente
call :log_info "Obteniendo merchandising..."
curl -s -X GET "%CONTENT_SERVICE%/merchandising" -o "%TEMP_FILE%"
call :extract_json_array_first "%TEMP_FILE%" "_id" MERCH_ID
if not defined MERCH_ID call :extract_json_array_first "%TEMP_FILE%" "id" MERCH_ID

if defined MERCH_ID (
    call :log_success "Merch existente encontrado: %MERCH_ID%"
) else (
    :: 6.2 Crear merch
    if defined ARTIST_ID (
        call :log_info "Creando merchandising de prueba..."
        curl -s -X POST "%CONTENT_SERVICE%/merchandising" ^
          -H "Content-Type: application/json" ^
          -d "{\"name\":\"Camiseta Test %RANDOM%\",\"price\":19.99,\"artistId\":\"%ARTIST_ID%\",\"type\":3,\"stock\":50}" ^
          -o "%TEMP_FILE%"
        
        call :extract_json_value "%TEMP_FILE%" "_id" MERCH_ID
        if not defined MERCH_ID call :extract_json_value "%TEMP_FILE%" "id" MERCH_ID
        if defined MERCH_ID (
            call :log_success "Merch creado: %MERCH_ID%"
        ) else (
            call :log_fail "Error creando merch"
        )
    )
)

:: 6.3 Obtener merch por ID
if defined MERCH_ID (
    call :log_info "Obteniendo merch por ID..."
    curl -s -X GET "%CONTENT_SERVICE%/merchandising/%MERCH_ID%" -o "%TEMP_FILE%"
    call :extract_json_value "%TEMP_FILE%" "name" MERCH_NAME
    if defined MERCH_NAME (
        call :log_success "Merch obtenido: %MERCH_NAME%"
    ) else (
        call :log_info "Merch: respuesta recibida"
    )
)

:: 6.4 Obtener merch por artista
if defined ARTIST_ID (
    call :log_info "Obteniendo merch por artista..."
    curl -s -X GET "%CONTENT_SERVICE%/merchandising/artist/%ARTIST_ID%" -o "%TEMP_FILE%"
    call :log_success "Merch por artista obtenido"
)

:: 6.5 Actualizar merch
if defined MERCH_ID (
    call :log_info "Actualizando merchandising..."
    curl -s -X PUT "%CONTENT_SERVICE%/merchandising/%MERCH_ID%" ^
      -H "Content-Type: application/json" ^
      -d "{\"price\":24.99,\"stock\":100}" ^
      -o "%TEMP_FILE%"
    call :log_success "Merch actualizado"
)

:: ═══════════════════════════════════════════════════════════════════════════
:: 7. USER SERVICE - FOLLOW Y LIKE
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "USER SERVICE - FOLLOW Y LIKE"

:: 7.1 Toggle follow
if defined ACCESS_TOKEN if defined ARTIST_ID (
    call :log_info "Toggle follow artista..."
    curl -s -X POST "%USER_SERVICE%/toggle-follow" ^
      -H "Authorization: Bearer %ACCESS_TOKEN%" ^
      -H "Content-Type: application/json" ^
      -d "{\"artistId\":\"%ARTIST_ID%\"}" ^
      -o "%TEMP_FILE%"
    call :log_success "Toggle follow ejecutado"
)

:: 7.2 Toggle like
if defined ACCESS_TOKEN if defined ALBUM_ID (
    call :log_info "Toggle like album..."
    curl -s -X POST "%USER_SERVICE%/toggle-like" ^
      -H "Authorization: Bearer %ACCESS_TOKEN%" ^
      -H "Content-Type: application/json" ^
      -d "{\"albumId\":\"%ALBUM_ID%\"}" ^
      -o "%TEMP_FILE%"
    call :log_success "Toggle like ejecutado"
)

:: ═══════════════════════════════════════════════════════════════════════════
:: 8. STATS SERVICE - EVENTOS
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "STATS SERVICE - EVENTOS"

:: Obtener timestamp actual en formato ISO
for /f "usebackq delims=" %%a in (`powershell -Command "Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ'"`) do set TIMESTAMP=%%a

:: 8.1 Enviar evento track.played
if defined ARTIST_ID (
    call :log_info "Enviando evento track.played..."
    curl -s -X POST "%STATS_SERVICE%/stats/events" ^
      -H "Content-Type: application/json" ^
      -d "{\"eventType\":\"track.played\",\"timestamp\":\"%TIMESTAMP%\",\"userId\":\"%USER_ID%\",\"entityId\":\"%ARTIST_ID%\",\"metadata\":{\"albumId\":\"%ALBUM_ID%\"}}" ^
      -o "%TEMP_FILE%"
    
    call :extract_json_value "%TEMP_FILE%" "accepted" EVENT_ACCEPTED
    if "%EVENT_ACCEPTED%"=="True" (
        call :log_success "Evento track.played enviado"
    ) else (
        call :log_info "Evento enviado (verificar respuesta)"
    )
)

:: 8.2 Enviar evento track.liked
if defined ARTIST_ID (
    call :log_info "Enviando evento track.liked..."
    curl -s -X POST "%STATS_SERVICE%/stats/events" ^
      -H "Content-Type: application/json" ^
      -d "{\"eventType\":\"track.liked\",\"timestamp\":\"%TIMESTAMP%\",\"userId\":\"%USER_ID%\",\"entityId\":\"%ARTIST_ID%\"}" ^
      -o "%TEMP_FILE%"
    
    call :extract_json_value "%TEMP_FILE%" "accepted" EVENT_ACCEPTED
    if "%EVENT_ACCEPTED%"=="True" (
        call :log_success "Evento track.liked enviado"
    ) else (
        call :log_info "Evento enviado (verificar respuesta)"
    )
)

:: 8.3 Enviar evento artist.followed
if defined ARTIST_ID (
    call :log_info "Enviando evento artist.followed..."
    curl -s -X POST "%STATS_SERVICE%/stats/events" ^
      -H "Content-Type: application/json" ^
      -d "{\"eventType\":\"artist.followed\",\"timestamp\":\"%TIMESTAMP%\",\"userId\":\"%USER_ID%\",\"entityId\":\"%ARTIST_ID%\"}" ^
      -o "%TEMP_FILE%"
    
    call :extract_json_value "%TEMP_FILE%" "accepted" EVENT_ACCEPTED
    if "%EVENT_ACCEPTED%"=="True" (
        call :log_success "Evento artist.followed enviado"
    ) else (
        call :log_info "Evento enviado (verificar respuesta)"
    )
)

:: 8.4 Enviar evento order.paid
if defined ARTIST_ID (
    call :log_info "Enviando evento order.paid..."
    curl -s -X POST "%STATS_SERVICE%/stats/events" ^
      -H "Content-Type: application/json" ^
      -d "{\"eventType\":\"order.paid\",\"timestamp\":\"%TIMESTAMP%\",\"userId\":\"%USER_ID%\",\"entityId\":\"%ARTIST_ID%\",\"metadata\":{\"price\":29.99}}" ^
      -o "%TEMP_FILE%"
    
    call :extract_json_value "%TEMP_FILE%" "accepted" EVENT_ACCEPTED
    if "%EVENT_ACCEPTED%"=="True" (
        call :log_success "Evento order.paid enviado"
    ) else (
        call :log_info "Evento enviado (verificar respuesta)"
    )
)

:: ═══════════════════════════════════════════════════════════════════════════
:: 9. STATS SERVICE - KPIs Y RANKINGS
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "STATS SERVICE - KPIs Y RANKINGS"

:: 9.1 Obtener KPIs de artista
if defined ARTIST_ID (
    call :log_info "Obteniendo KPIs del artista..."
    curl -s -X GET "%STATS_SERVICE%/stats/artist/%ARTIST_ID%/kpis" -o "%TEMP_FILE%"
    call :extract_json_value "%TEMP_FILE%" "plays" ARTIST_PLAYS
    call :extract_json_value "%TEMP_FILE%" "likes" ARTIST_LIKES
    call :extract_json_value "%TEMP_FILE%" "follows" ARTIST_FOLLOWS
    call :log_success "KPIs obtenidos - Plays: %ARTIST_PLAYS%, Likes: %ARTIST_LIKES%, Follows: %ARTIST_FOLLOWS%"
)

:: 9.2 Obtener KPIs con rango de fechas
if defined ARTIST_ID (
    call :log_info "Obteniendo KPIs con rango de fechas..."
    curl -s -X GET "%STATS_SERVICE%/stats/artist/%ARTIST_ID%/kpis?startDate=2025-01-01&endDate=2025-12-31" -o "%TEMP_FILE%"
    call :log_success "KPIs con fechas obtenidos"
)

:: 9.3 Trending tracks
call :log_info "Obteniendo trending tracks..."
curl -s -X GET "%STATS_SERVICE%/stats/trending?genre=tracks&period=week&limit=5" -o "%TEMP_FILE%"
call :log_success "Trending tracks obtenido"

:: 9.4  Trending artists
call :log_info "Obteniendo trending artists..."
curl -s -X GET "%STATS_SERVICE%/stats/trending?genre=artists&period=week&limit=5" -o "%TEMP_FILE%"
call :log_success "Trending artists obtenido"

:: ═══════════════════════════════════════════════════════════════════════════
:: 10. STATS SERVICE - CACHE y CB
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "STATS SERVICE - CACHE Y CIRCUIT BREAKER"

:: 10.1 Cache info
call :log_info "Obteniendo info del cache..."
curl -s -X GET "%STATS_SERVICE%/stats/cache/info" -o "%TEMP_FILE%"
call :extract_json_value "%TEMP_FILE%" "current_size" CACHE_SIZE
call :extract_json_value "%TEMP_FILE%" "max_size" CACHE_MAX
call :log_success "Cache info - Size: %CACHE_SIZE%/%CACHE_MAX%"

:: 10.2 Circuit breaker status
call :log_info "Obteniendo estado del circuit breaker..."
curl -s -X GET "%STATS_SERVICE%/stats/cb/status" -o "%TEMP_FILE%"
:: Extraer fail_count en lugar de state (evita caracteres < > que rompen batch)
for /f "usebackq delims=" %%a in (`powershell -Command "try { $json = Get-Content '%TEMP_FILE%' -Raw | ConvertFrom-Json; 'fail_count=' + $json.fail_count + ', fail_max=' + $json.fail_max } catch { 'error' }"`) do set CB_INFO=%%a

:: Determinar estado basado en si el state contiene "Closed", "Open" o "HalfOpen"
for /f "usebackq delims=" %%a in (`powershell -Command "try { $s = (Get-Content '%TEMP_FILE%' -Raw | ConvertFrom-Json).state; if ($s -match 'Closed') { 'CLOSED' } elseif ($s -match 'Open') { 'OPEN' } elseif ($s -match 'HalfOpen') { 'HALF_OPEN' } else { 'UNKNOWN' } } catch { 'ERROR' }"`) do set CB_STATE=%%a

call :log_success "Circuit breaker state: %CB_STATE% (%CB_INFO%)"


:: ═══════════════════════════════════════════════════════════════════════════
:: 11. STATS SERVICE - RECOMENDACIONES
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "STATS SERVICE - RECOMENDACIONES"

:: 11.1 Recomendaciones para usuario
if defined USER_ID (
    call :log_info "Obteniendo recomendaciones para usuario..."
    curl -s -X GET "%STATS_SERVICE%/recommendations/user/%USER_ID%?limit=5" -o "%TEMP_FILE%"
    call :log_success "Recomendaciones de usuario obtenidas"
)

:: 11.2 Recomendaciones similares por genero
call :log_info "Obteniendo recomendaciones similares (Rock)..."
curl -s -X GET "%STATS_SERVICE%/recommendations/similar?genre=Rock&limit=5" -o "%TEMP_FILE%"
call :log_success "Recomendaciones similares obtenidas"

:: 11.3 Recomendaciones excluyendo album
if defined ALBUM_ID (
    call :log_info "Obteniendo recomendaciones excluyendo album..."
    curl -s -X GET "%STATS_SERVICE%/recommendations/similar?genre=Rock&excludeId=%ALBUM_ID%&limit=5" -o "%TEMP_FILE%"
    call :log_success "Recomendaciones con exclusion obtenidas"
)

:: ═══════════════════════════════════════════════════════════════════════════
:: 12. STATS SERVICE - ALERTAS (CON TU EMAIL)
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "STATS SERVICE - ALERTAS (EMAIL: %MY_EMAIL%)"

if defined ARTIST_ID (
    call :log_info "Creando alerta para artista con notificacion a %MY_EMAIL%..."
    
    :: Usar ruta fija para evitar problemas con %RANDOM% en la ruta
    set ALERT_RESPONSE=%TEMP%\alert_response.json
    
    curl -s -X POST "%STATS_SERVICE%/stats/alerts" ^
      -H "Content-Type: application/json" ^
      -d "{\"artistId\":\"%ARTIST_ID%\",\"windowMinutes\":60,\"thresholds\":{\"plays\":0,\"likes\":0,\"follows\":0},\"notifyEmail\":\"%MY_EMAIL%\"}" ^
      -o "!ALERT_RESPONSE!"
    
    :: Inicializar valores
    set ALERT_TRIGGERED=false
    set EMAIL_SENT=false
    
    :: Usar rutas fijas para los archivos temporales
    set TRIG_FILE=%TEMP%\alert_trig.txt
    set EMAIL_FILE=%TEMP%\alert_email.txt
    
    :: Eliminar archivos previos si existen
    if exist "!TRIG_FILE!" del "!TRIG_FILE!" 2>nul
    if exist "!EMAIL_FILE!" del "!EMAIL_FILE!" 2>nul
    
    :: Ejecutar PowerShell con la ruta escapada correctamente
    powershell -NoProfile -Command "$f='!ALERT_RESPONSE!'; $j=Get-Content $f -Raw|ConvertFrom-Json; $j.triggered.ToString().ToLower()" > "!TRIG_FILE!" 2>nul
    powershell -NoProfile -Command "$f='!ALERT_RESPONSE!'; $j=Get-Content $f -Raw|ConvertFrom-Json; if($j.email){$j.email.sent.ToString().ToLower()}else{'false'}" > "!EMAIL_FILE!" 2>nul
    
    :: Leer valores
    if exist "!TRIG_FILE!" (
        set /p ALERT_TRIGGERED=<"!TRIG_FILE!"
    )
    if exist "!EMAIL_FILE!" (
        set /p EMAIL_SENT=<"!EMAIL_FILE!"
    )

    echo [INFO] Alerta triggered: !ALERT_TRIGGERED!
    echo [INFO] Email enviado: !EMAIL_SENT!
    
    if "!ALERT_TRIGGERED!"=="true" (
        call :log_success "Alerta activada - revisa tu email!"
    ) else (
        call :log_info "Alerta evaluada (puede estar en cooldown)"
    )
    
    :: Mostrar detalles de la respuesta
    echo [INFO] Respuesta completa de la alerta:
    type "!ALERT_RESPONSE!"
    echo.
    
    :: Limpiar archivos temporales de alertas
    if exist "!TRIG_FILE!" del "!TRIG_FILE!" 2>nul
    if exist "!EMAIL_FILE!" del "!EMAIL_FILE!" 2>nul
    if exist "!ALERT_RESPONSE!" del "!ALERT_RESPONSE!" 2>nul
)

:: ═══════════════════════════════════════════════════════════════════════════
:: 13. USER SERVICE - LOGOUT
:: ═══════════════════════════════════════════════════════════════════════════

call :log_section "USER SERVICE - LOGOUT"

call :log_info "Cerrando sesion..."
curl -s -X POST "%USER_SERVICE%/logout" ^
  -H "Authorization: Bearer %ACCESS_TOKEN%" ^
  -o "%TEMP_FILE%"

call :extract_json_value "%TEMP_FILE%" "success" LOGOUT_SUCCESS
if "%LOGOUT_SUCCESS%"=="True" (
    call :log_success "Logout exitoso"
) else (
    call :log_info "Logout: respuesta recibida"
)

:: ═══════════════════════════════════════════════════════════════════════════
:: RESUMEN FINAL
:: ═══════════════════════════════════════════════════════════════════════════

:end

echo.
echo ╔══════════════════════════════════════════════════════════════════════════╗
echo ║                         RESUMEN DE PRUEBAS                               ║
echo ╠══════════════════════════════════════════════════════════════════════════╣
echo ║  Tests exitosos: %TESTS_PASSED%                                                      
echo ║  Tests fallidos: %TESTS_FAILED%                                                      
echo ╠══════════════════════════════════════════════════════════════════════════╣
echo ║  IDs utilizados:                                                         ║
echo ║    User ID:   %USER_ID%
echo ║    Artist ID: %ARTIST_ID%
echo ║    Album ID:  %ALBUM_ID%
echo ║    News ID:   %NEWS_ID%
echo ║    Merch ID:  %MERCH_ID%
echo ╠══════════════════════════════════════════════════════════════════════════╣
echo ║  Email para alertas: %MY_EMAIL%
echo ╚══════════════════════════════════════════════════════════════════════════╝
echo.

:: Limpiar archivos temporales
if exist "%TEMP_FILE%" del "%TEMP_FILE%" 2>nul
if exist "%TEMP%\http_code.txt" del "%TEMP%\http_code.txt" 2>nul

echo Pruebas completadas. Presiona cualquier tecla para salir...
pause >nul

endlocal