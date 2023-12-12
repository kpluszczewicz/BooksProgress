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
    read_books_list: "Lista przeczytanych książek",
    books_put_aisde_list: "Przerwane czytanie",
    action_save: "Zapisz",
    action_yes: "Tak",
    action_put_aside: "Przerwij czytanie książki",
    action_continue_reading: "Wznowić czytanie?",

    action_cancel: "Anuluj",
    update_page: "Podaj stronę na której skończyłeś"
  },
  "en": {
    books_list: "List of books being read",
    read_books_list: "List of books already read",
    books_put_aisde_list: "Books put aside",
    action_save: "Save",
    action_yes: "Yes",
    action_put_aside: "Put book aside",
    action_continue_reading: "Continue reading?",
    action_cancel: "Cancel",
    update_page: "Enter page you have stopped reading on"
  }
}

const BOOKS_CACHE_DIRECTORY = "BooksProgress"
const BOOKS_CACHE_DATABASE_FILENAME = "books_progress_db.json"
const BOOKS_CACHE = new Cache(BOOKS_CACHE_DIRECTORY)

const widget = { config: { width: 320, height: 10 }}
if (config.widgetFamily == "small") widget.config.width = 140

const localeMessages = (Device.locale() == "en_PL" ? MESSAGES["pl"] : MESSAGES["en"])

// Representation of particular book
class Book {
  constructor(obj) {
    this.title = obj["title"]
    this.currentPage = obj["currentPage"]
    this.currentPageInt = parseInt(this.currentPage)
    this.textLength = obj["textLength"]
    this.textLengthInt = parseInt(this.textLength)
    this.startingDate = new Date(obj["startingDate"])
    this.lastReadDate = new Date(obj["lastReadDate"])
    this.putAside = obj["putAside"]
  }

  // prints status of a book in form ie 13/233 where 13 is current page and 233 is total number of pages
  printPageStatus() {
    let currentPage = this.currentPage
    let textLength = this.textLength
    return `${currentPage}/${textLength}`
  }

  isPutAside() { return this.putAside == true }
  isRead() {
    return !this.isPutAside() && this.currentPageInt == this.textLengthInt
  }
  isBeingRead() {
    return !this.isPutAside() && this.currentPageInt < this.textLengthInt
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

const BOOKS = await Book.all()

class ShelfView {
  constructor(wall, config) {
    this.wall = wall
    this.title = config.title
    this.onTap = config.onTap
    this.books = config.books
  }

  present() {
    // Add title row unless this.showTitle set to false
    if (this.title && this.books.length > 0) {
      let titleRow = new UITableRow()
      let titleCell = titleRow.addText(this.title)
      titleRow.height = 60
      titleRow.backgroundColor = Color.yellow()
      titleCell.titleFont = Font.boldSystemFont(20)
      titleCell.titleColor = Color.white()
      titleCell.subtitleColor = Color.white()
      this.wall.addRow(titleRow)
    }

    // show books
    let books = this.books
    for (let book of books) {
      let bookRow = new UITableRow()

      if (this.formatRowFunc) {
        this.formatRowFunc(bookRow, book)
      } else {
        // default row content - only title
        let titleCell = bookRow.addText(book.title)
        bookRow.dismissOnSelect = true
      }

      let that = this
      if (this.onTap) { bookRow.onSelect = (idx) => { that.onTap(book) } }

      this.wall.addRow(bookRow)
    }

  }
}

const tapFunctions = {
  forBooksBeingRead: async function(book) {
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
    alert.addAction(localeMessages.action_put_aside)
    alert.addCancelAction(localeMessages.action_cancel)
    let idx = await alert.presentAlert()
    if (idx != -1) {
      log(`Update current page with action ${idx}`)
      let previousCurrentPage = parseInt(book.currentPage)

      // check if user read some pages
      if (idx < 6)
        book.currentPage = (idx == 5 ? alert.textFieldValue(0) : previousCurrentPage + idx + 1)
      // check if user decided to put book aside and remove from current shelf
      else if (idx == 6) book.putAside = true

      book.lastReadDate = new Date()
      log("Page of book from " + previousCurrentPage + " to " + book.currentPage)
      Book.save(BOOKS)
    }
  },
  forBooksPutAside: async function(book) {
    let alert = new Alert() 
    alert.title = localeMessages.action_continue_reading
    alert.addAction(localeMessages.action_yes)
    alert.addCancelAction(localeMessages.action_cancel)
    let idx = await alert.presentAlert()
    if (idx != -1) {
      book.putAside = false
      Book.save(BOOKS)
    }
  },
  forAlreadyReadBooks: function() {

  }
}


if (config.runsInWidget) {
  const mainWidget = new ListWidget()
  mainWidget.backgroundColor = new Color("#222222")

  let top4Books = BOOKS.slice(0, 5)
  top4Books.forEach(book => { 
    if (book.isBeingRead()) drawBookProgress(book, mainWidget) 
  });

  Script.setWidget(mainWidget)
  Script.complete()
  
} else if (config.runsInApp) {

  let uiBooksTable = initBooksTable()

  let booksBeingRead = BOOKS.filter((book) => book.isBeingRead())
  let readBooks = BOOKS.filter((book) => book.isRead())

  let booksBeingReadConfig =  { books: booksBeingRead, onTap: tapFunctions.forBooksBeingRead }
  let booksBeingReadShelf = new ShelfView(uiBooksTable, booksBeingReadConfig)

  booksBeingReadShelf.formatRowFunc = function(bookRow, book) {
    let titleCell = bookRow.addText(book.title)
    let pagesCell = bookRow.addText(book.printPageStatus())
    titleCell.widthWeight = 80
    pagesCell.widthWeight = 20
    bookRow.dismissOnSelect = true
  }

  booksBeingReadShelf.present()

  let readBooksConfig =  { title: localeMessages.read_books_list, books: readBooks }
  let readBooksShelf = new ShelfView(uiBooksTable, readBooksConfig)

  readBooksShelf.present()

  let booksPutAside = BOOKS.filter((b) => b.isPutAside())
  let booksPutAsideConfig = { title: localeMessages.books_put_aisde_list, books: booksPutAside, onTap: tapFunctions.forBooksPutAside }
  let putAsideBooksShelf = new ShelfView(uiBooksTable, booksPutAsideConfig)
  putAsideBooksShelf.present()

  uiBooksTable.present()
}

function initBooksTable() {
  let table = new UITable()
  //logo.font = Font.heavySystemFont(14)
  let headerRow = new UITableRow()
  let headerCell = headerRow.addText(localeMessages.books_list)
  headerRow.height = 60
  headerRow.backgroundColor = Color.yellow()
  headerCell.titleFont = Font.boldSystemFont(20)
  headerCell.titleColor = Color.white()
  headerCell.subtitleColor = Color.white()
  table.showSeparators = true

  table.addRow(headerRow)
  return table
}

function drawBookProgress(book, mainWidget) {
  var bookTitle = book.title 
  if (config.widgetFamily == "small" && bookTitle.length > 20) {
    bookTitle = book.title.slice(0, 17) + "..."
  }

  const titlew = mainWidget.addText(bookTitle)
  titlew.textColor = new Color("#e587ce")
  titlew.font = Font.boldSystemFont(12)
  mainWidget.addSpacer(3)
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

