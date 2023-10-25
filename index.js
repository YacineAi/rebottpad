const express = require('express');
const app = express();
const os = require('os');
const axios = require("axios");
const cheerio = require('cheerio');
const Botly = require("botly");
const botly = new Botly({
    accessToken: process.env.PAGE_ACCESS_TOKEN,
    verifyToken: process.env.VERIFY_TOKEN,
    webHookPath: process.env.WB_PATH,
    notificationType: Botly.CONST.REGULAR,
    FB_URL: "https://graph.facebook.com/v2.6/",
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false} });

const headers = {
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Cookie":"token=369655189:2:1697695251:xbyyOCRI-aOklMbmBBxWVcmOY2zHjdfsNInsgH-Qvaq473nkhAF6gD5VaKMMZTHk;" 
}
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(express.json({ verify: botly.getVerifySignature(process.env.APP_SECRET) }));
app.use(express.urlencoded({ extended: false }));
app.use("/webhook", botly.router());

function formatBytes(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + " " + sizes[i];
}

app.get("/", (req, res) => {
  const memoryUsage = process.memoryUsage();
  let uptimeInSeconds = process.uptime();

  let uptimeString = "";
  if (uptimeInSeconds < 60) {
    uptimeString = `${uptimeInSeconds.toFixed()} seconds`;
  } else if (uptimeInSeconds < 3600) {
    uptimeString = `${(uptimeInSeconds / 60).toFixed()} minutes`;
  } else if (uptimeInSeconds < 86400) {
    uptimeString = `${(uptimeInSeconds / 3600).toFixed()} hours`;
  } else {
    uptimeString = `${(uptimeInSeconds / 86400).toFixed()} days`;
  }

  const osInfo = {
    totalMemoryMB: (os.totalmem() / (1024 * 1024)).toFixed(2),
    freeMemoryMB: (os.freemem() / (1024 * 1024)).toFixed(2),
    cpus: os.cpus(),
  };

  res.render("index", { memoryUsage, uptimeString, formatBytes, osInfo });
});

/* ----- DB Qrs ----- */
async function createUser(user) {
    const { data, error } = await supabase
        .from('users')
        .insert([ user ]);
  
      if (error) {
        throw new Error('Error creating user : ', error);
      } else {
        return data
      }
  };
  
  async function updateUser(id, update) {
    const { data, error } = await supabase
      .from('users')
      .update( update )
      .eq('uid', id);
  
      if (error) {
        throw new Error('Error updating user : ', error);
      } else {
        return data
      }
  };
  
  async function userDb(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('uid', userId);
  
    if (error) {
      console.error('Error checking user:', error);
    } else {
      return data
    }
  };


  
botly.on("message", async (senderId, message) => {
  if (senderId == "6114274025328348") {
    if (message.message.text) {
      const user = await userDb(senderId);
      if (user[0]) {
        if (user[0].os == null) {
          botly.sendText({
            id: senderId,
            text: "ماهو التطبيق الذي تستعمله 🤔💬 ؟",
            quick_replies: [
              botly.createQuickReply("ماسنجر 💬", "messenger"),
              botly.createQuickReply("فيسبوك لايت 🗨️", "lite")
            ],
          });
        } else if (user[0].lang == null) {
          botly.sendText({
            id: senderId,
            text: "ماهي لغة الروايات التي تفضلها ؟ 🌐",
            quick_replies: [
              botly.createQuickReply("العربية 🇩🇿", "16"),
              botly.createQuickReply("الانجليزية 🇺🇸", "1")
            ],
          });
        } else if (user[0].name == null) {
          if (message.message.text.length <= 15) {
            botly.sendText({
              id: senderId,
              text: `توجد روايات إسمك يمكنني تغييرها إلى إسمك الخاص 😅\nهل تريد إستعمال (${message.message.text}) كإسم خاص بك ؟ 🤔`,
              quick_replies: [
                botly.createQuickReply("قبول ✅", message.message.text),
                botly.createQuickReply("رفض ❎", "rename"),
                botly.createQuickReply("تخطي ⬅️", "skip")
              ],
            });
          } else {
            botly.sendText({
              id: senderId,
              text: "لا يمكن للإسم أن يكون أطول من 15 حرف",
              quick_replies: [
                botly.createQuickReply("تخطي ⬅️", "skip")
              ],
            });
          }
        } else {
          if (user[0].os == "messenger") {
            const search = await axios.get(`https://api.wattpad.com/v4/search/stories?query=${encodeURIComponent(message.message.text)}&mature=1&free=1&paid=1&limit=10&fields=stories(id%2Ctitle%2CvoteCount%2CreadCount%2CnumParts%2Cuser%2Cmature%2Ccompleted%2Crating%2Ccover%2Cpromoted%2CisPaywalled%2CpaidModel)&language=${user[0].lang}`, { headers: headers });
            
            const list = [];
            search.data.stories.forEach((x) => {
              const contents = {
                title: `${x.title}`,
                image_url: `${x.cover}`,
                subtitle: `${x.user.name} 👤 | ${x.readCount} 👁‍🗨 | جزء ${x.numParts}`,
                buttons: [botly.createPostbackButton('بدأ قراءة الرواية 📖', `${x.id}`),
                          botly.createPostbackButton('قراءة وصف الرواية ℹ', `${x.id}`),
                          botly.createPostbackButton('الإعدادات ⚙', "Settings")]
              }
              list.push(contents);
              });
              botly.sendGeneric({id: senderId, elements: list, aspectRatio: Botly.CONST.IMAGE_ASPECT_RATIO.SQUARE});

           } else {
            const search = await axios.get(`https://api.wattpad.com/v4/search/stories?query=${encodeURIComponent(message.message.text)}&mature=1&free=1&paid=1&limit=5&fields=stories(id%2Ctitle%2CvoteCount%2CreadCount%2CnumParts%2Cuser%2Cmature%2Ccompleted%2Crating%2Ccover%2Cpromoted%2CisPaywalled%2CpaidModel)&language=${user[0].lang}`, { headers: headers });

            search.data.stories.forEach((x, i) => {
              setTimeout(function(){
                const contents = {
                  title: `${x.title}`,
                  image_url: `${x.cover}`,
                  subtitle: `${x.user.name} 👤 | ${x.readCount} 👁‍🗨 | جزء ${x.numParts}`,
                  buttons: [botly.createPostbackButton('بدأ قراءة الرواية 📖', `${x.id}`),
                            botly.createPostbackButton('قراءة وصف الرواية ℹ', `${x.id}`),
                            botly.createPostbackButton('الإعدادات ⚙', "Settings")]
                }
                botly.sendGeneric({id: senderId, elements: [contents], aspectRatio: Botly.CONST.IMAGE_ASPECT_RATIO.SQUARE});
               }
              , i * 1000);
              });
           }
        }
      } else { // new
        await createUser({uid: senderId, os: null, pad: null, lang: null, name: null})
        .then((data, error) => {
          botly.sendText({
            id: senderId,
            text: "مرحبا بك 💜\nبوتباد أول بوت خاص بالروايات من واتباد على الفيسبوك 🤩\nيمكنك كتابة إسم رواية تعرفها و سأرسلها لك 💬✅\nلكن عليك قبل كل شيئ عليك إختيار بعض الأمور 😅 إضغط بدأ 👇🏻",
            quick_replies: [
              botly.createQuickReply("بدأ ⬅️", "start")
            ],
          });
        });
      }
  } else if (message.message.attachments[0].payload.sticker_id) {
      botly.sendText({ id: senderId, text: "(Y)" });
  } else if (message.message.attachments[0].type == "image" || message.message.attachments[0].type == "audio" || message.message.attachments[0].type == "video") {
      botly.sendText({ id: senderId, text: "attach"});
  }
  } else {
    botly.sendText({
      id: senderId,
      text: "يجري إعتماد التحسينات الان... يرجى الصبر",
      quick_replies: [
        botly.createQuickReply("موافق ⬅️", "skip")
      ],
    });
  }
});


async function getStory(url) {
  try {
    const response = await axios.get(url);
    const html = response.data;

    const $ = cheerio.load(html);
    const textArray = [];

    $('p').each((index, element) => {
      const text = $(element).text().trim();
      if (text) {
        textArray.push(text);
      }
    });
    const scrapedText = textArray.join('\n');
    return scrapedText;
  } catch (error) {
    console.error('An error occurred while scraping the content:', error);
  }
};

botly.on("postback", async (senderId, message, postback) => {
  if (senderId == "6114274025328348") {
    if (message.postback) {
      if (postback == "GET_STARTED") {
        await createUser({uid: senderId, os: null, pad: null, lang: null, name: null})
            .then((data, error) => {
              botly.sendText({
                id: senderId,
                text: "مرحبا بك 💜\nبوتباد أول بوت خاص بالروايات من واتباد على الفيسبوك 🤩\nيمكنك كتابة إسم رواية تعرفها و سأرسلها لك 💬✅\nلكن عليك قبل كل شيئ عليك إختيار بعض الأمور 😅 إضغط بدأ 👇🏻",
                quick_replies: [
                  botly.createQuickReply("بدأ ⬅️", "start")
                ],
              });
            });
      } else if (postback == "Settings") {
        const pree = (term) => {
          if (term == "16") {
            return "العربية 🇩🇿";
          } else if (term == "1") {
            return "الانجليزية 🇺🇸";
          } else if (term == "messenger") {
            return "ماسنجر 💬";
          } else if (term == "lite") {
            return "فيسبوك لايت 🗨️";
          } else if (term == ".") {
            return ".";
          }
        };
        
        const user = await userDb(senderId);
        botly.sendText({ // pree(user[0].mature)
          id: senderId,
          text: `مرحبا بك 💜 إليك إعداداتك 🪪 :\nإسمك 👤 : ${user[0].name}\nلغة الروايات 🌐 : ${pree(user[0].lang)}\nالمنصة 📱 : ${pree(user[0].os)}`,
          quick_replies: [
            botly.createQuickReply("تغيير الاسم 👤", "namechange"),
            botly.createQuickReply("تغيير اللغة 🌐", "langchange"),
            botly.createQuickReply("تغيير المنصة 📱", "oschange")
          ],
        });
      } else if (postback == "messenger") {
        //
      } else if (postback == "mature0") {
        //
      } else if (postback == "mature1") {
        //
      } else if (postback == "ReCountry") {
        //
      } else if (postback.startsWith("cn-")) {
        //
      } else if (message.postback.title == "قراءة وصف الرواية ℹ") {
        const desc = await axios.get(`https://www.wattpad.com/api/v3/stories/${postback}?drafts=0&include_deleted=1&fields=id%2Ctitle%2Clength%2CcreateDate%2CmodifyDate%2CvoteCount%2CreadCount%2CcommentCount%2Curl%2Cpromoted%2Csponsor%2Clanguage%2Cuser%2Cdescription%2Ccover%2Chighlight_colour%2Ccompleted%2CisPaywalled%2CpaidModel%2Ccategories%2CnumParts%2CreadingPosition%2Cdeleted%2CdateAdded%2ClastPublishedPart%28createDate%29%2Ctags%2Ccopyright%2Crating%2Cstory_text_url%28text%29%2C%2Cparts%28id%2Ctitle%2CvoteCount%2CcommentCount%2CvideoId%2CreadCount%2CphotoUrl%2CmodifyDate%2CcreateDate%2Clength%2Cvoted%2Cdeleted%2Ctext_url%28text%29%2Cdedication%2Curl%2CwordCount%29%2CisAdExempt%2CtagRankings`);
  
        botly.sendText({ 
          id: senderId,
          text: desc.data.description,
          quick_replies: [
            botly.createQuickReply("بدأ القراءة", desc.data.parts[0])
          ],
        });
      } else if (message.postback.title == "بدأ قراءة الرواية 📖") {
        const read = await axios.get(`https://www.wattpad.com/api/v3/stories/${postback}?drafts=0&include_deleted=1&fields=id%2Ctitle%2Clength%2CcreateDate%2CmodifyDate%2CvoteCount%2CreadCount%2CcommentCount%2Curl%2Cpromoted%2Csponsor%2Clanguage%2Cuser%2Cdescription%2Ccover%2Chighlight_colour%2Ccompleted%2CisPaywalled%2CpaidModel%2Ccategories%2CnumParts%2CreadingPosition%2Cdeleted%2CdateAdded%2ClastPublishedPart%28createDate%29%2Ctags%2Ccopyright%2Crating%2Cstory_text_url%28text%29%2C%2Cparts%28id%2Ctitle%2CvoteCount%2CcommentCount%2CvideoId%2CreadCount%2CphotoUrl%2CmodifyDate%2CcreateDate%2Clength%2Cvoted%2Cdeleted%2Ctext_url%28text%29%2Cdedication%2Curl%2CwordCount%29%2CisAdExempt%2CtagRankings`);
  
        var text = getStory(read.data.parts[0])
  
        botly.sendText({ 
          id: senderId,
          text: text,
          quick_replies: [
            botly.createQuickReply("التالي", "desc.data.parts[0]")
          ],
        });
      } else if (message.postback.title == "3") {
        //
      } else if (message.postback.title == "4") {
        //
      } else if (message.postback.title == "5") {
        //
      }
    } else {
      if (postback == "Settings") {
        const pree = (term) => {
          if (term == "16") {
            return "العربية 🇩🇿";
          } else if (term == "1") {
            return "الانجليزية 🇺🇸";
          } else if (term == "messenger") {
            return "ماسنجر 💬";
          } else if (term == "lite") {
            return "فيسبوك لايت 🗨️";
          } else if (term == ".") {
            return ".";
          }
        };
        
        const user = await userDb(senderId);
        botly.sendText({ // pree(user[0].mature)
          id: senderId,
          text: `مرحبا بك 💜 إليك إعداداتك 🪪 :\nإسمك 👤 : ${user[0].name}\nلغة الروايات 🌐 : ${pree(user[0].lang)}\nالمنصة 📱 : ${pree(user[0].os)}`,
          quick_replies: [
            botly.createQuickReply("تغيير الاسم 👤", "namechange"),
            botly.createQuickReply("تغيير اللغة 🌐", "langchange"),
            botly.createQuickReply("تغيير المنصة 📱", "oschange")
          ],
        });
      } else if (postback.length == 2) {
        //
      } else if (postback == "start") {
        botly.sendText({
          id: senderId,
          text: "ماهو التطبيق الذي تستعمله 🤔💬 ؟",
          quick_replies: [
            botly.createQuickReply("ماسنجر 💬", "s-messenger"),
            botly.createQuickReply("فيسبوك لايت 🗨️", "s-lite")
          ],
        });
      } else if (postback == "s-messenger" || postback == "s-lite") {
        var shape = postback.slice(2);
        await updateUser(senderId, {os: shape})
            .then((data, error) => {
              if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
              botly.sendText({
                id: senderId,
                text: "تم الحفظ ✅\nماهي لغة الروايات التي تفضلها ؟ 🌐",
                quick_replies: [
                  botly.createQuickReply("العربية 🇩🇿", "s-16"),
                  botly.createQuickReply("الانجليزية 🇺🇸", "s-1")
                ],
              });
            });
      } else if (postback == "s-16" || postback == "s-1") {
        var shape = postback.slice(2);
        await updateUser(senderId, {lang: shape})
            .then((data, error) => {
              if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
              botly.sendText({
                id: senderId,
                text: "توجد روايات إسمك إذا اردت تخصيص الاسم ليتيغير الى إسمك الخاص يرجى كتابة إسمك الان 😅\nإذن.... ماهو إسمك ؟",
                quick_replies: [
                  botly.createQuickReply("تخطي ⬅️", "skip")
                ],
              });
            });
      } else if (postback == "skip") {
        await updateUser(senderId, {name: "skipped"})
            .then((data, error) => {
              if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
              botly.sendText({id: senderId, text: "تم التخطي ✅ شكرا لك 🥰"});
            });
      } else if (postback == "namechange") {
        await updateUser(senderId, {name: null})
            .then((data, error) => {
              if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
              botly.sendText({id: senderId, text: "يرجى كتابة الأسم الذي تريده"});
            });
      } else if (postback == "langchange") {
        botly.sendText({
          id: senderId,
          text: "تم الحفظ ✅\nماهي لغة الروايات التي تفضلها ؟ 🌐",
          quick_replies: [
            botly.createQuickReply("العربية 🇩🇿", "16"),
            botly.createQuickReply("الانجليزية 🇺🇸", "1")
          ],
        });
      } else if (postback == "oschange") {
        botly.sendText({
          id: senderId,
          text: "ماهو التطبيق الذي تستعمله 🤔💬 ؟",
          quick_replies: [
            botly.createQuickReply("ماسنجر 💬", "messenger"),
            botly.createQuickReply("فيسبوك لايت 🗨️", "lite")
          ],
        });
      } else if (postback == "rename") {
        botly.sendText({
          id: senderId,
          text: "يرجى كتابة إسم اخر اذن...",
          quick_replies: [
            botly.createQuickReply("تخطي ⬅️", "skip")
          ],
        });
      } else if (postback == "16" || postback == "1") {
        await updateUser(senderId, {lang: postback})
            .then((data, error) => {
              if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
              botly.sendText({id: senderId, text: "تم الحفظ ✅ شكرا لك 🥰"});
            });
      } else if (message.message.text == "ماسنجر 💬" || message.message.text == "فيسبوك لايت 🗨️") {
        await updateUser(senderId, {os: postback})
            .then((data, error) => {
              if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
              botly.sendText({id: senderId, text: "تم الحفظ ✅ شكرا لك 🥰"});
            });
      } else if (message.message.text == "قبول ✅") {
        await updateUser(senderId, {name: postback})
            .then((data, error) => {
              if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
              botly.sendText({id: senderId, text: "تم الحفظ ✅ شكرا لك 🥰"});
            });
      } else if (message.message.text == "5") {
        //
      }
    }
  } else {
    botly.sendText({
      id: senderId,
      text: "يجري إعتماد التحسينات الان... يرجى الصبر",
      quick_replies: [
        botly.createQuickReply("موافق ⬅️", "skip")
      ],
    });
  }
});

app.listen(3000, () => {
    console.log('App listening on port 3000!');
});