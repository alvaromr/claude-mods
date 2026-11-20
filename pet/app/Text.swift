// Every text the pet shows the person, in Spanish, kept together for the
// planned translation. What is not copy (bundle ids, defaults keys, symbol
// names, patterns, Claude Code's own words) stays where it is used.

import Foundation

enum Text {
    /// The language the formatters write numbers and dates in.
    static let locale = Locale(identifier: "es")

    // MARK: - Menus and alerts

    static let menuSettings = "Ajustes…"
    static let menuHelp = "Ayuda…"
    static let menuQuit = "Salir"
    static let markSeen = "Ya la he visto"
    static let closeSession = "Cerrar sesión"
    static let cancel = "Cancelar"
    static let reset = "Restablecer"
    static let resetTitle = "¿Restablecer los ajustes?"
    static let resetNote = "Vuelven todos a como venían, animaciones incluidas. La mascota se queda donde está."
    static let closeWorking = "Está trabajando: se perderá el turno en curso."
    static func closeTitle(_ name: String) -> String { "¿Cerrar «\(name)»?" }

    // MARK: - Pet and bubble

    static let tabWaiting = "Esperan"
    static let tabWorking = "Trabajando"
    static let tabInactive = "Inactivas"
    static let emptyWaiting = "Ninguna sesión espera tu respuesta"
    static let emptyWorking = "Ninguna sesión trabajando"
    static let emptyInactive = "Ninguna sesión inactiva"
    static let noWindow = "sin ventana que abrir"
    static let now = "ahora"
    static let apiError = "error de la API"
    static func openIn(_ app: String) -> String { "Abrir en \(app)" }
    static func petLabel(_ tip: String) -> String { "Mascota de Claude: \(tip)" }
    static func sessionsWaiting(_ n: Int) -> String {
        n == 1 ? "1 sesión espera tu respuesta" : "\(n) sesiones esperan tu respuesta"
    }
    static func sessionsNeeding(_ n: Int) -> String { n == 1 ? ", 1 te necesita" : ", \(n) te necesitan" }

    // MARK: - Marks, places and reasons

    static let markScheduled = "programada"
    static let markCommand = "comando en marcha"
    static func markAgents(_ n: Int) -> String { n == 1 ? "1 subagente" : "\(n) subagentes" }
    static func markServer(_ ports: [Int]) -> String { "servidor en marcha · \(portList(ports))" }
    static func portList(_ ports: [Int]) -> String {
        (ports.count == 1 ? "puerto " : "puertos ") + ports.map(String.init).joined(separator: ", ")
    }
    static let tipScheduled = "Tiene una tarea programada (un /loop, un recordatorio)"
    static let tipCommand = "Tiene un comando en marcha en segundo plano"
    static func tipAgents(_ label: String) -> String { "Tiene \(label) trabajando en segundo plano" }
    static func tipServer(_ ports: [Int]) -> String { "Dejó un servidor en marcha, en el \(portList(ports))" }
    static func tipFailed(_ failure: String) -> String { "Acabó con un error de la API: \(failure)" }
    static let lossScheduled = "Tiene una tarea programada, que se perderá."
    static let lossCommand = "Tiene un comando en marcha, que se cortará."
    static let lossAgents = "Tiene subagentes trabajando, que se perderán."
    static let lossServer = "Tiene un servidor en marcha, que se cortará."
    static let claudeApp = "la app de Claude"
    static let reasonInput = "espera tu respuesta"
    static let reasonDialog = "tiene un diálogo abierto"
    static let reasonSandbox = "pide acceso de red"
    static let reasonGoal = "propone un objetivo"
    static let reasonNeeded = "te necesita"
    static func reasonApprove(_ what: Substring) -> String { "aprobar \(what)" }

    // MARK: - Ajustes window

    static let settingsTitle = "Ajustes de la mascota"
    static let petSize = "Tamaño de la mascota"
    static let inactiveAfter = "Considerar inactiva tras"
    static func minutes(_ n: Int) -> String { "\(n) min" }
    static let soundWaiting = "Sonido cuando una sesión pasa a esperarte"
    static let soundNeeded = "Sonido cuando una sesión te necesita"
    static let bubble = "Bocadillo"
    static let bubbleSize = "Tamaño"
    static let bubbleSizes = ["Compacto", "Normal", "Grande"]
    static let headline = "Destacar"
    static let headlines = ["Sesión", "Proyecto"]
    static let orcaIcons = "Con el icono que le da Orca, si destaca el proyecto"
    static let bubbleSide = "Posición"
    static let bubbleSides = ["Arriba", "Abajo", "Izquierda", "Derecha"]
    static let closeOnPress = "Cerrarlo al abrir una sesión"
    static let closeOnPressOptions = ["Siempre", "Si es la única que espera", "Nunca"]
    static let animations = "Animaciones"
    static let tryOut = "Probar"
    static let moodsNote = "Estados: se repite mientras dura"
    static let eventsNote = "Eventos: se reproduce una vez"
    static let resetSettings = "Restablecer ajustes…"

    // MARK: - Ayuda window

    static let helpTitle = "Ayuda de la mascota"
    static let helpTabs = "Pestañas del bocadillo"
    static let helpMarks = "Delante de lo destacado de la sesión"
    static let helpPlaces = "Al final de la fila: dónde te lleva pulsarla"
    static let helpPet = "En la mascota"
    static let helpAlerts = "Avisos"
    static let helpMouse = "Ratón"
    static let helpSound = "Sonido"
    static let helpClick = "Clic"
    static let helpDoubleClick = "Doble clic"
    static let helpDrag = "Arrastrar"
    static let helpRightClick = "Clic derecho"

    static let tabWaitingHelp = "Las que acabaron su turno hace menos de lo que marca «Considerar inactiva tras» "
        + "en Ajustes, y las bloqueadas, por mucho que haga."
    static let tabWorkingHelp = "Las que están en un turno, y las que siguen solas: "
        + "con una tarea programada, un comando o subagentes en segundo plano."
    static let tabInactiveHelp = "Las que llevan más de ese tiempo sin moverse, "
        + "y las que marcaste con «Ya la he visto»."
    static let markBlockedHelp = "Se ha parado en algo que solo tú puedes contestar: "
        + "un permiso, una pregunta o un plan. Espera aunque haga rato."
    static let markScheduledHelp = "Tiene una tarea programada (un /loop, un recordatorio): "
        + "sigue sola, así que está en «Trabajando»."
    static let markCommandHelp = "Dejó un comando corriendo en segundo plano (un build, los hooks de un commit): "
        + "sigue en «Trabajando» hasta que acabe. Un servidor no cuenta."
    static let markAgentsHelp = "Tiene subagentes trabajando en segundo plano: sigue en «Trabajando» hasta que acaben."
    static let markServerHelp = "Dejó un servidor en marcha (un comando que escucha en un puerto, como `pnpm dev`): "
        + "no acaba solo, así que la sesión espera por ti como cualquier otra."
    static let markFailedHelp = "Su último turno acabó con un error de la API (un límite, la conexión perdida); "
        + "se quita al volver a escribirle."
    static let placeOrcaHelp = "Te lleva a su pestaña de Orca."
    static let placeBotHelp = "Es el chat de un bot de Orca: te lleva a ese bot en Orca."
    static let placeDesktopHelp = "Te lleva a la sesión en la app de Claude."
    static let placeAppHelp = "Trae al frente la app donde corre, como su terminal; no sabe llegar a la pestaña."
    static let placeNowhereHelp = "Sin icono: no hay ventana a la que llevarte."
    static let badgeHelp = "Cuántas sesiones esperan tu respuesta."
    static let badgeBlockedHelp = "Igual, en rojo cuando alguna te necesita para seguir."
    static let soundHelp = "Uno cuando una sesión pasa a esperarte y otro cuando te necesita; "
        + "cada uno se apaga en Ajustes."
    static let bubbleHelp = "Se abre solo cuando una sesión acaba o te necesita, salvo que ya la tengas delante en "
        + "Orca. Se cierra solo cuando ya no espera ninguna, salvo que lo abrieras tú sin que esperara ninguna."
    static let clickHelp = "En la mascota, abre o cierra el bocadillo. En una sesión, te lleva a ella; "
        + "el bocadillo se cierra o no según «Cerrarlo al abrir una sesión» en Ajustes."
    static let doubleClickHelp = "En una sesión, te lleva a ella y además cierra el bocadillo."
    static let dragHelp = "Mueve la mascota; el bocadillo la sigue."
    static let rightClickHelp = "En la mascota: Ajustes, Ayuda y Salir. "
        + "En una sesión: «Ya la he visto» (si espera sin estar bloqueada) y «Cerrar sesión»."
}
