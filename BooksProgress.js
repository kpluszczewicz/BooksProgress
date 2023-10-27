// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: hourglass-half;
class Cache {
  constructor(name) {
    this.fm = FileManager.iCloud();
    this.cachePath = this.fm.joinPath(this.fm.documentsDirectory(), name);

    if (!this.fm.fileExists(this.cachePath)) {
      this.fm.createDirectory(this.cachePath);
    }
  }
  async read(key, expirationMinutes) {
    try {
      const path = this.fm.joinPath(this.cachePath, key);
      await this.fm.downloadFileFromiCloud(path);
      const createdAt = this.fm.creationDate(path);
      if (expirationMinutes) {
        if ((new Date()) - createdAt > (expirationMinutes * 60000)) {
          this.fm.remove(path);
          return null;
        }
      }
      const value = this.fm.readString(path);

      try {
        return JSON.parse(value);
      } catch (error) {
        console.log("Error parsing file " + error)
        return value;
      }
    } catch (error) {
      console.log("Error reading file " + error)
      return null;
    }
  }
  write(key, value) {
    const path = this.fm.joinPath(this.cachePath, key.replace('/', '-'));
    console.log(`Caching to ${path}...`);

    if (typeof value === 'string' || value instanceof String) {
      this.fm.writeString(path, value);
    } else {
      this.fm.writeString(path, JSON.stringify(value));
    }
  }
}

const MESSAGES = {
  "pl": {
    books_list: "Lista aktualnie czytanych książek",
    action_save: "Zapisz",
    action_cancel: "Anuluj",
    update_page: "Podaj stronę na której skończyłeś"
  },
  "en": {
    books_list: "List of books being read",
    action_save: "Save",
    action_cancel: "Cancel",
    update_page: "Enter page you have stopped reading on"
  }
}

const BOOKS_CACHE_DIRECTORY = "BooksProgress"
const BOOKS_CACHE_DATABASE_FILENAME = "books_progress_db.json"
const BOOKS_CACHE = new Cache(BOOKS_CACHE_DIRECTORY)
const widget = { config: { width: 320, height: 10 }}
const localeMessages = (Device.locale() == "en_PL" ? MESSAGES["pl"] : MESSAGES["en"])

// Representation of particular book
class Book {
  constructor(obj) {
    this.title = obj["title"]
    this.currentPage = obj["currentPage"]
    this.textLength = obj["textLength"]
    this.startingDate = new Date(obj.startingDate)
    this.lastReadDate = new Date(obj.lastReadDate)
  }

  // prints status of a book in form ie 13/233 where 13 is current page and 233 is total number of pages
  printPageStatus() {
    let currentPage = this.currentPage
    let textLength = this.textLength
    return `${currentPage}/${textLength}`
  }

  // to save any book to db file you need to save whole array, can't operate on singular books
  static save(booksArray) {
    BOOKS_CACHE.write(BOOKS_CACHE_DATABASE_FILENAME, { "books": booksArray })
  }

  // pull all the books from db file
  // returns array of Book instances
  static async all() {
    let booksJson = await BOOKS_CACHE.read(BOOKS_CACHE_DATABASE_FILENAME)

    if (booksJson == null || booksJson["books"] == undefined) {
      console.log("Can't read db file")
      booksJson = { "books": [] }
    }
    let books = []
    // nie wiadomo czemu, w tej wersji Scriptable bez "let" wywala błąd
    for (let obj of booksJson.books) books.push(new Book(obj))

    return books
  }
}


if (config.runsInWidget) {
  const mainWidget = new ListWidget()
  mainWidget.backgroundColor = new Color("#222222")
  let books = await Book.all()

  books.forEach(book => { drawBookProgress(book, mainWidget) });

  Script.setWidget(mainWidget)
  mainWidget.presentMedium()
  Script.complete()
  
} else if (config.runsInApp) {

  let uiBooksTable = initBooksTable()

  // musi być await
  let books = await Book.all()

  for (book of books) {
    let row = new UITableRow()
    let titleCell = row.addText(book.title)
    let pagesCell = row.addText(book.printPageStatus())
    titleCell.widthWeight = 80
    pagesCell.widthWeight = 20
    row.dismissOnSelect = true
    row.onSelect = (idx) => {
      let b = books[idx - 1]
      let previousCurrentPage = b.currentPage
       editBook(b, books)
    }
    uiBooksTable.addRow(row)
  }

  uiBooksTable.present()
}

async function editBook(book, books) {
  log("--- editing book " + book.title)
  let alert = new Alert()
  alert.title = localeMessages.update_page
  // !! BARDZO WAŻNE - funkcja addTextField wywala się po cichu, gdy argument nie jest typu string
  let textField = alert.addTextField("Page", book.currentPage.toString())
  textField.setNumberPadKeyboard()

  for (let i=1; i< 6; ++i) {
    alert.addAction((parseInt(book.currentPage)+i).toString())
  }

  alert.addAction(localeMessages.action_save)
  alert.addCancelAction(localeMessages.action_cancel)
  let idx = await alert.presentAlert()
  if (idx != -1) {
    log(`Update current page with action ${idx}`)
    let previousCurrentPage = parseInt(book.currentPage)
    book.currentPage = (idx == 5 ? alert.textFieldValue(0) : previousCurrentPage + idx + 1)

    book.lastReadDate = new Date()
    log("Page of book from " + previousCurrentPage + " to " + book.currentPage)
    Book.save(books)
  }
}

function initBooksTable() {
  let table = new UITable()
  //logo.font = Font.heavySystemFont(14)
  let headerRow = new UITableRow()
  let headerCell = headerRow.addText(localeMessages.books_list)
  headerRow.height = 80
  headerRow.backgroundColor = Color.yellow()
  headerCell.titleFont = Font.boldSystemFont(20)
  headerCell.titleColor = Color.white()
  headerCell.subtitleColor = Color.white()
  table.showSeparators = true

  table.addRow(headerRow)
  return table
}

function drawBookProgress(book, mainWidget) {
  const titlew = mainWidget.addText(book.title)
  titlew.textColor = new Color("#e587ce")
  titlew.font = Font.boldSystemFont(13)
  mainWidget.addSpacer(6)
  const imgw = mainWidget.addImage(creatProgress(book.textLength, book.currentPage))
  imgw.imageSize=new Size(widget.config.width, widget.config.height)
  mainWidget.addSpacer(6)
}

function creatProgress(total,havegone) {
  const context =new DrawContext()
  let width = widget.config.width
  let height = widget.config.height

  context.size=new Size(width, height)
  context.opaque=false
  context.respectScreenScale=true
  context.setFillColor(new Color("#48484b"))
  const path = new Path()
  path.addRoundedRect(new Rect(0, 0, width, height), 3, 2)
  context.addPath(path)
  context.fillPath()
  context.setFillColor(new Color("#ffd60a"))
  const path1 = new Path()
  path1.addRoundedRect(new Rect(0, 0, width*havegone/total, height), 3, 2)
  context.addPath(path1)
  context.fillPath()
  return context.getImage()
}

