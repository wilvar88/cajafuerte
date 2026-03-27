// Nombre de la hoja de cálculo donde están los datos de usuarios
const SHEET_USERS = "Tabla_1"; 
// Nombre de la hoja donde está la clave
const SHEET_CONFIG = "Tabla_2";

// Función auxiliar para buscar hojas tolerando fallos de escritura (mayúsculas o espacios extra)
function getSheetLoose(ss, name, fallbackIndex) {
  const sheets = ss.getSheets();
  const target = name.toString().trim().toLowerCase();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === target) {
      return sheets[i];
    }
  }
  // Si no la encuentra, retorna la del índice de respaldo (0 para la primera, 1 para la segunda)
  return sheets[fallbackIndex] || sheets[0]; 
}

// Función para procesar peticiones GET (Leer datos del usuario y la clave)
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return ContentService.createTextOutput(JSON.stringify({error: "No se encuentra el Spreadsheet conectado"})).setMimeType(ContentService.MimeType.JSON);
    
    // Leer combinación
    const sheetConfig = getSheetLoose(ss, SHEET_CONFIG, 1); // Intentar Tabla_2 o la segunda pestaña
    let combo = [25, 40, 30, "Tope"]; // Default de respaldo
    if (sheetConfig) {
      const configData = sheetConfig.getDataRange().getValues();
      if (configData.length > 1) {
        combo = [configData[1][0], configData[1][1], configData[1][2], configData[1][3]];
      }
    }

    const identificacion = e.parameter.id;
    
    // Si no hay ID, asumimos que solo pide la configuración
    if (!identificacion) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true, 
        combo: combo
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Buscar usuario
    const sheetUsers = getSheetLoose(ss, SHEET_USERS, 0); // Intentar Tabla_1 o la primera pestaña
    if (!sheetUsers) {
      return ContentService.createTextOutput(JSON.stringify({error: "No se encontró la hoja de usuarios"})).setMimeType(ContentService.MimeType.JSON);
    }
    
    const data = sheetUsers.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === identificacion.toString()) {
        const usuario = {
          fila: i + 1,
          identificacion: data[i][0],
          nombre: data[i][1],
          intentosPendientes: data[i][7], // Columna H (Índice 7)
          notaPromedio: data[i][8],       // Columna I (Índice 8)
          resultado: data[i][9],          // Columna J (Índice 9)
          nivel: data[i][10]              // Columna K (Índice 10)
        };
        return ContentService.createTextOutput(JSON.stringify({
          success: true, 
          data: usuario,
          combo: combo 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({error: "Usuario no encontrado"})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: "Error en el servidor: " + err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

// Función para procesar peticiones POST (Guardar la nota de un intento)
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getSheetLoose(ss, SHEET_USERS, 0);
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({error: "Hoja de usuarios no encontrada."})).setMimeType(ContentService.MimeType.JSON);
    
    // Parsear los datos enviados desde el frontend (JS)
    const body = JSON.parse(e.postData.contents);
    const identificacion = body.id;
    const nota = body.nota;

    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === identificacion.toString()) {
        const filaReal = i + 1;
        
        let columnaGuardar = -1;
        for (let c = 2; c <= 6; c++) {
          if (data[i][c] === "" || data[i][c] === null) {
            columnaGuardar = c + 1; 
            break;
          }
        }

        if (columnaGuardar !== -1) {
          sheet.getRange(filaReal, columnaGuardar).setValue(nota);
          return ContentService.createTextOutput(JSON.stringify({success: true, message: "Nota guardada con éxito"})).setMimeType(ContentService.MimeType.JSON);
        } else {
          return ContentService.createTextOutput(JSON.stringify({error: "No hay intentos disponibles para este usuario"})).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({error: "Usuario no encontrado para guardar nota"})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: "Error POST: " + err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}
