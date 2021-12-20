# MultipartField
Below is a breakdown of the `MultipartField` object made available through the `Request.multipart()` handler provided when parsing multipart forms and accepting file uploads.

#### Working With A Multipart Field
The `MultipartField` component is meant to be an abstraction that explains each incoming field from a multipart form request. This component differentiates between text-type fields and file-type fields by populating the `file` property only when the field is a file-type. 

See below for an example profile image file upload scenario:
```javascript
const FileSystem = require('fs');
webserver.post('/profile/image/upload', async (request, response) => {
    // Ensure the user is signed in and retrieve their acccount id
    // We use the hyper-express-session middleware here
    await request.session.start();
    const account_id = request.session.get('account_id');
    if (account_id === undefined) return response.status(403).send('You must be logged in to use this endpoint.');

    // Begin parsing this request as a multipart request
    let save_path;
    try {
        await request.multipart(async (field) => {
            // Ensure that this field is a file-type
            // You may also perform your own checks on the encoding and mime type as needed
            if (field.file) {
                // Save the file to the profile images folder
                save_path = `./storage/images/user-image-${account_id}.jpg`;
                
                // Use an await while writing to ensure the "await request.multipart()" does not continue until this file is done writing
                await field.write(save_path);
            }
        });
    } catch (error) {
        // The multipart parser may throw a string constant as an error
        // Be sure to handle these as stated in the documentation
        if (typeof error === 'FILES_LIMIT_REACHED') {
            return response.status(403).send('You sent too many files! Try again.');
        } else {
            return response.status(500).send('Oops! An uncaught error occured on our end.');
        }
    }
    
    // Ensure save_path is defined, if it is undefined than that means we did not receive an image.
    if (save_path) {
        // You may do your own post processing on the image here
        save_image_to_database(account_id, save_path);
        
        // Send a response to the user so they know the image was successfully uploaded
        return response.send('Your profile image has been updated!');
    } else {
        // We did not receive any image in the multipart request, let the user know
        return response.status(400).send('No profile image was received. Please try again.');
    }
});
```

#### MultipartField Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `name`    | `String` | Field Name. |
| `encoding`| `String` | Field data encoding. |
| `mime_type`| `String` | Field data mime type. |
| `value`| `String` | Field value (only populated if field is not a file-type).|
| `file`| `Object` | Field file data (only populated if field is a file-type).|
| `file.name`| `String` | File name (only populated if supplied). |
| `file.stream`| `stream.Readable` | Readable stream of file data. |
| `truncated`| `Object` | Field truncations (Only populated if field is not a file-type). |
| `truncated.name`| `Boolean` | Field name was truncated. |
| `truncated.value`| `Boolean` | Field value was truncated. |

#### MultipartField Methods
* `write(path: String, options?: stream.WritableOptions)`: Writes/Saves file content to the specified path and name.
    * **Returns** a `Promise` which is resolved once file writing has completed.
    * **Note** this method is **only** available for file-type fields.
    * **Note** this method uses the `field.file.stream` stream therefore you will not be able to re-use this field's file stream after running this method.