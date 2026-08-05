auto.waitFor();

//请求截图
//每次使用该函数都会弹出截图权限请求，建议选择“总是允许”。
if(!requestScreenCapture()){
    toast("请求截图失败");
    exit();
}
//安卓版本高于Android 9
if(device.sdkInt>28){
    //等待截屏权限申请并同意
    threads.start(function () {
        text('允许').waitFor();
        text('允许').click();
    });
}

// 截图
app.launchPackage('com.qidian.QDReader');
waitForPackage('com.qidian.QDReader');
if (text('角色')) {
    click(500, 500)
    sleep(500)
}
let from = 0, to = 999, page = 0
let workspace = '/sdcard/Pictures/qidian'
let subpath = `${from}-${to}`
sleep(500)
while (true) {
    sleep(1000)
    let path = `${workspace}/${subpath}/${page}.png`
    files.ensureDir(path)
    captureScreen(path)
    // 下一页
    click(980, 2300)
    if (files.length === 1000) {
        let code = zipAndSave()
        if (code === 0) {
            from = to + 1
            to = from + 999
            subpath = `${from}-${to}`
        } else {
            console.show();
            console.log(code);
            device.vibrate(500)
            break
        }
    }
    page++
}

function zipAndSave() {
    let filename = `${workspace}/${subpath}.zip`
    let filedir = `${workspace}/${subpath}`
    ensureDir(filename)
    return zips.A('zip', filename, filedir)
}

