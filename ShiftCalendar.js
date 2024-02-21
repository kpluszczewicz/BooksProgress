// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: briefcase;
// To simply print a text on the screen do this.

const SHIFT_CALENDAR_DIR = 'ShiftCalendar'
const Cache = importModule('Cache');
const cache = new Cache(SHIFT_CALENDAR_DIR);
let FM = FileManager.iCloud()
let DATAPATH = FM.joinPath(FM.documentsDirectory(), SHIFT_CALENDAR_DIR)

const zeroPad = (num, places) => String(num).padStart(places, '0')

if (config.runsInWidget) {
  let widget = new ListWidget()
  widget.backgroundColor = new Color("#0b0201", 0.88)
  widget.setPadding(5, 10, 5, 5)

  let filenames = FM.listContents(DATAPATH)

  for (const filename of filenames) {
    let jsonDataFromFile = await cache.read(filename)
    createSchedule(widget, jsonDataFromFile, jsonDataFromFile.title)
  }

  Script.setWidget(widget)
}

function createSchedule(mainWidget, jsonFileWithSchedule, label) {
  let titleText = mainWidget.addText(label)
  titleText.textColor = Color.white()
  titleText.font = Font.boldSystemFont(15)
  mainWidget.addSpacer(7)

  let yesterday = getYesterdayDate()

  let days = [ "Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb" ]
  for (let j = 0; j < yesterday.getDay(); j++) days.push(days.shift())

  let headerStack = mainWidget.addStack()

  let headerText = " " + days.join(" ")
  let headerTextWidget = headerStack.addText(headerText)
  headerTextWidget.font = new Font("Menlo-Bold", 11)
  headerTextWidget.textColor = Color.white()

  mainWidget.addSpacer(5)

  let statusStack = mainWidget.addStack()
  let text = ""
  let iDay = getYesterdayDate()

  for(let j = 0; j < 7; j++, iDay.setDate(iDay.getDate() + 1)) {
    let yearIndex = iDay.getFullYear()
    let monthIndex = zeroPad(iDay.getMonth() + 1, 2)
    let dayIndex = zeroPad(iDay.getDate(), 2)
    let charFromFile = ""
    try {
      charFromFile = jsonFileWithSchedule[yearIndex][monthIndex][dayIndex]
    } catch (e) {
      charFromFile = "E"
    }
    text += " " + charFromFile + " "
  }
  let marekTextWidget = statusStack.addText(text)
  marekTextWidget.textColor = Color.white()
  marekTextWidget.font = new Font("Menlo-Regular", 11)

  mainWidget.addSpacer(10)
}

function getYesterdayDate() {
  let date = new Date()
  date.setDate(date.getDate() - 1)
  return date
}
