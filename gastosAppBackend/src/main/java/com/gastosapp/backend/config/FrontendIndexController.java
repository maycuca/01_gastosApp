package com.gastosapp.backend.config;

import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Serves index.html for "/". The resource handler of {@link FrontendConfig}
 * covers every other path, but Spring's ResourceHttpRequestHandler ignores an
 * empty path, so the root needs its own mapping.
 */
@Controller
public class FrontendIndexController {

    private final Path index;

    public FrontendIndexController(DirectoryProperties directories) {
        this.index = directories.frontendDir().resolve(FrontendConfig.INDEX);
    }

    @GetMapping("/")
    public ResponseEntity<Resource> index() throws NoResourceFoundException {
        if (!Files.isRegularFile(index)) {
            throw new NoResourceFoundException(HttpMethod.GET, "/", FrontendConfig.INDEX);
        }
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noCache())
                .contentType(MediaType.TEXT_HTML)
                .body(new FileSystemResource(index));
    }
}
