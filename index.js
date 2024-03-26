require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const {google} = require('googleapis');
const fs = require('fs')

const token = process.env.TELEGRAM_TOKEN
const bot = new TelegramBot(token, {polling: true})
const schedule = require('node-schedule');

const serviceAccount = fs.readFileSync('./service-account.json')
const CREDENTIALS = JSON.parse(serviceAccount);
const calendarId = process.env.CALENDAR_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/calendar';
const calendar = google.calendar({version : "v3"});
const auth = new google.auth.JWT(
    CREDENTIALS.client_email,
    null,
    CREDENTIALS.private_key,
    SCOPES
);

// Get all the events between two dates
const getEvents = async (dateTimeStart, dateTimeEnd) => {
    try {
        let response = await calendar.events.list({
            auth: auth,
            calendarId: calendarId,
            timeMin: dateTimeStart,
            timeMax: dateTimeEnd,
            timeZone: 'Asia/Ho_Chi_Minh'
        });
        console.log(response['data']['items']);
        let items = response['data']['items'];
        return items;
    } catch (error) {
        console.log(`Error at getEvents --> ${error}`);
        return 0;
    }
};

let previousJob = null;

function createJob(googleCalendarList, chatId) {
    // Hủy công việc trước nếu có
    if (previousJob !== null) {
        previousJob.cancel();
    }
    googleCalendarList.forEach(function(item, index) {
        if (item?.start?.dateTime) {
            let time = new Date(item.start.dateTime);
            let minutes = time.getMinutes();
            let hours = time.getHours();
            let date = time.getDate();
            let month = time.getMonth() + 1;
            let cron = `${minutes} ${hours} ${date} ${month} *`;
            console.log(cron);
            let job = schedule.scheduleJob(cron, function() {
                bot.sendMessage(chatId, `${item.summary}`);
                if(chatId !== process.env.CHAT_ID){
                    bot.sendMessage(process.env.CHAT_ID, `${item.summary}`);
                }
                //sau khi chạy xong thì xoá luôn cron job này.
                job.cancel();
            });
            // Hủy công việc trước và gán công việc mới vào biến previousJob
            previousJob = job;
        }
    });
}

function getGoogleCalendarAPI(chatId) {
	let currentTime = new Date();
	let start = `${currentTime.getFullYear()}-${currentTime.getMonth() + 1}-${currentTime.getDate()}T00:00:00+07:00`;
	let end = `${currentTime.getFullYear()}-${currentTime.getMonth() + 1}-${currentTime.getDate()}T23:59:59+07:00`;
	getEvents(start, end)
		.then((res) => {
			createJob(res, chatId);
		})
		.catch((err) => {
			console.log(err);
		});
}

function createCalendar(chatId, message, hour, minute){
    let currentTime = new Date();
    // Define event data
    const event = {
        summary: `${message}`,
        description: 'Schedule',
        start: {
            dateTime: `${currentTime.getFullYear()}-${currentTime.getMonth() + 1}-${currentTime.getDate()}T${hour}:${minute}:00+07:00`,
            timeZone: 'Asia/Ho_Chi_Minh'
        },
        end: {
            dateTime: `${currentTime.getFullYear()}-${currentTime.getMonth() + 1}-${currentTime.getDate()}T${hour}:59:59+07:00`,
            timeZone: 'Asia/Ho_Chi_Minh'
        },
    };
  
    // Insert event to the calendar
    calendar.events.insert({
        auth: auth,
        calendarId: calendarId,     
        resource: event,
    },(err, res) => {
        if (err) {
            console.error('Error adding event:', err);
            return;
        }
        getGoogleCalendarAPI(chatId);
    });
}

function isDatePart(str) {
    // Sử dụng biểu thức chính quy để kiểm tra định dạng của chuỗi
    const dateRegex = /^\d{2}\-\d{2}\-\d{4}$/;
    return dateRegex.test(str);
}

function isTimePart(str) {
    const timeRegex = /^\d{2}\:\d{2}$/;
    return timeRegex.test(str);
}

bot.onText(/\/remind (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const resp = match[1]
    const [timePart, ...messageArr] = resp.split(' ');
    
    if(timePart === undefined || messageArr.length <= 0 || !isTimePart(timePart)){
        bot.sendMessage(chatId, 'create failed schedule')
        return
    }
    const [hour, minute] = timePart.split(':');
    if(hour > 23 || hour < 0 || minute > 59 || minute < 0){
        bot.sendMessage(chatId, 'create failed schedule')
        return
    }
    const message = messageArr.join(' ')
    createCalendar(chatId, message, hour, minute)
    bot.sendMessage(chatId, `Calendar has been added`)
})

// lên lịch mỗi ngày dùng cronjob để lấy lịch trên google celendar
schedule.scheduleJob('0 7 * * *', function() {
    let chatId = process.env.CHAT_ID;
	getGoogleCalendarAPI(chatId);
});

